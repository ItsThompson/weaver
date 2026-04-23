# Weaver Playwright E2E — Implementation Plan

## Overview

Add end-to-end integration tests to Weaver using Playwright's Electron support. Tests exercise the full stack — Electron shell, embedded Fastify server, and React client — as a single integrated system. Component-level testing remains with Jest + Testing Library; Playwright covers user-facing flows and edge cases only.

### Success criteria

- `npm run test:e2e` from the repo root launches the Electron app against an isolated temp data directory and runs all test suites
- Zero interaction with the real `~/.weaver` directory
- Tests cover: app lifecycle, window toggle, ghost mode, mini mode, tray menu, SSE navigation, config lifecycle, session data CRUD, and clean shutdown
- CI-compatible (headless, no display required beyond Electron's own)

### Constraints

- F5 global shortcut and tray clicks are OS-native; tested via `electronApp.evaluate()` calling exposed test harness functions, not simulated input
- Data isolation via `HOME` env var override — all `homedir()` calls in the server resolve to a per-run temp directory
- Playwright Electron support uses the **library API** (`@playwright/test` + `electron` from `playwright`), not the CLI `npx playwright test` browser mode

### Critical: CJS module scoping and the test harness

`electronApp.evaluate()` only receives the `electron` module — it cannot access module-scoped functions like `toggleWindow()`, `setGhostMode()`, etc. inside the bundled CJS entry (`desktop/dist/main.cjs`). This is a fundamental CJS limitation, not a Playwright bug.

**Solution:** A `global.__weaverTest` object is exposed in the Electron main process when `WEAVER_TEST=1` env var is set. This gives tests access to the app's internal functions and state. The harness is added in step 6 and used by steps 5 (rewrite), 7, and 9.

---

## Architecture decisions

| Decision | Rationale |
|---|---|
| Root-level `e2e/` workspace | Tests span desktop + server + client; doesn't belong in any single package |
| `HOME` env var for isolation | Every server module uses `homedir()` + `.weaver`; overriding `HOME` redirects all of them with zero code changes |
| `mktemp -d` per test run | Each run gets a fresh directory; cleaned up in `afterAll` |
| Build before test | Tests run against compiled artifacts (`desktop/dist/main.cjs`); `turbo build` is a prerequisite, not part of the test |
| Shared fixture for app launch | Single `electronApp` fixture handles launch, server readiness wait, page acquisition, and teardown |
| `global.__weaverTest` harness | CJS module scoping prevents `evaluate()` from accessing app functions directly. A guarded global exposes them for tests only (`WEAVER_TEST=1`). Zero production impact. |

---

## Files to create

| File | Purpose |
|---|---|
| `e2e/package.json` | Workspace package with Playwright dependency |
| `e2e/tsconfig.json` | TypeScript config extending base |
| `e2e/playwright.config.ts` | Playwright config (timeout, retries, reporter) |
| `e2e/fixtures/app.ts` | Shared fixture: launch Electron, wait for server, provide `page` + `electronApp` + `tmpDir` |
| `e2e/fixtures/seed.ts` | Helpers to write session data, log files, and config into the temp data dir |
| `e2e/tests/app-lifecycle.spec.ts` | App boot and shutdown tests |
| `e2e/tests/window-toggle.spec.ts` | Window visibility toggle tests |
| `e2e/tests/ghost-mode.spec.ts` | Ghost mode tests |
| `e2e/tests/mini-mode.spec.ts` | Mini mode tests |
| `e2e/tests/tray-menu.spec.ts` | Tray menu action tests |
| `e2e/tests/navigation.spec.ts` | SSE-driven navigation tests |
| `e2e/tests/config.spec.ts` | Config API lifecycle tests |
| `e2e/tests/sessions.spec.ts` | Session CRUD tests |

### Files to modify

| File | Change |
|---|---|
| `package.json` (root) | Add `e2e` to `workspaces`, add `test:e2e` script |
| `turbo.json` | Add `test:e2e` task depending on `build` |
| `.gitignore` | Add `e2e/test-results/`, `e2e/playwright-report/` |
| `desktop/src/window.ts` | Add `_getTestState()` export (step 6) |
| `desktop/src/main.ts` | Add `global.__weaverTest` block guarded by `WEAVER_TEST` env var (step 6) |

---

## Implementation steps

Each step is a single unit of work for one agent. Steps are sequential — each depends on the prior step being complete.

---

### Step 1: Scaffold the e2e workspace

Create the `e2e/` package with dependencies and config files. No tests yet.

**Create:**
- `e2e/package.json` — name `weaver-e2e`, private, type `module`, devDependencies: `@playwright/test`, `playwright`, `@types/node`, `typescript`. Scripts: `test` → `npx playwright test`, `test:ui` → `npx playwright test --ui`
- `e2e/tsconfig.json` — extends `../tsconfig.base.json`, include `**/*.ts`, compilerOptions: `noEmit: true`, `types: ["node"]`
- `e2e/playwright.config.ts` — timeout 60s, retries 0, reporter `list`, single project named `electron`, no `webServer` (Electron manages the server). testDir `./tests`

**Modify:**
- `package.json` (root) — add `"e2e"` to `workspaces` array, add script `"test:e2e": "npm test --prefix e2e"`
- `turbo.json` — add `"test:e2e": { "dependsOn": ["build"], "cache": false }`
- `.gitignore` — add `e2e/test-results/` and `e2e/playwright-report/`

**Acceptance:** `cd e2e && npx playwright test` runs (and reports 0 tests found). `npm install` from root resolves the new workspace.

---

### Step 2: Create the Electron app fixture

Build the shared test fixture that launches the Electron app with an isolated data directory.

**Create:**
- `e2e/fixtures/app.ts` — exports a custom Playwright `test` object via `test.extend<AppFixtures>()` with these fixtures:
  - `tmpDir`: calls `mkdtemp` to create a temp dir, creates `.weaver/logs/` inside it, tears down with `rm -rf` in cleanup
  - `electronApp`: launches Electron via `_electron.launch({ args: ['desktop/dist/main.cjs'], env: { ...process.env, HOME: tmpDir, WEAVER_TEST: '1' } })`, closes in cleanup
  - `serverUrl`: `http://localhost:8143` constant
  - `page`: waits for server health check (poll `GET /api/health`), then gets `electronApp.firstWindow()`

**Acceptance:** A trivial test file that imports the fixture, launches the app, and asserts `page.title()` is not empty — passes.

---

### Step 3: Create the seed data helpers

Build helpers for writing test data into the isolated temp directory.

**Create:**
- `e2e/fixtures/seed.ts` — exports:
  - `seedSession(tmpDir, session: Partial<Session>)` — writes a session line to `<tmpDir>/.weaver/sessions.jsonl`
  - `seedLogEvents(tmpDir, sessionId, events: HookEvent[])` — writes events to `<tmpDir>/.weaver/logs/<sessionId>.jsonl`
  - `seedConfig(tmpDir, config: Partial<WeaverConfig>)` — writes merged config to `<tmpDir>/.weaver/config.json`
  - `makeSession(overrides?)` — returns a complete `Session` object with sensible defaults (random id, pid, timestamps)
  - `makeHookEvent(overrides?)` — returns a complete `HookEvent` with defaults

**Acceptance:** Unit-level sanity — a test that seeds data and reads it back from the filesystem matches.

---

### Step 4: App lifecycle tests

**Create:**
- `e2e/tests/app-lifecycle.spec.ts`

**Test cases:**
1. **Server starts and responds** — `GET /api/health` returns `{ status: "ok" }`
2. **Client renders in BrowserWindow** — page URL contains `localhost:8143`, page has visible content (body not empty)
3. **Data directory created** — `<tmpDir>/.weaver/logs/` exists after launch
4. **Window properties** — via `electronApp.evaluate()`: window is alwaysOnTop, not resizable
5. **Dock is hidden** — `app.dock` is hidden (macOS)

**Acceptance:** All 5 tests pass against a freshly built app.

---

### Step 5: Window toggle tests (initial — close-based)

**Create:**
- `e2e/tests/window-toggle.spec.ts`

These tests use `win.close()` to trigger the hide path (the close handler calls `e.preventDefault()` and sets opacity to 0). The full toggle cycle (hide → show → hide) requires the test harness added in step 6.

**Test cases:**
1. **Window starts visible** — opacity is 1
2. **Close hides window** — `win.close()`, opacity becomes 0
3. **Close when hidden stays hidden** — close twice, opacity stays 0
4. **Rapid closes don't destroy window** — 10 consecutive closes, window not destroyed
5. **Window close intercepted** — after close, window still exists, not destroyed

**Acceptance:** All 5 tests pass.

---

### Step 6: Add test harness and rewrite window toggle tests

This is the ONE step that modifies desktop source code. It adds a `global.__weaverTest` object that exposes module-scoped functions to `electronApp.evaluate()`, guarded by the `WEAVER_TEST` env var (zero production impact).

**Modify:**
- `desktop/src/window.ts` — add one new export:
  ```typescript
  export function _getTestState() {
    return { visible, ghostEnabled, ghostOpacityValue, miniMode };
  }
  ```
- `desktop/src/main.ts` — add at the end of the `app.on('ready')` callback, after `showWindow()`:
  ```typescript
  if (process.env.WEAVER_TEST) {
    (global as any).__weaverTest = {
      toggleWindow,
      showWindow,
      setGhostMode,
      isWindowVisible,
      isMiniMode,
      getState: _getTestState,
      toggleGhost: () => {
        currentConfig.ghost_mode = !currentConfig.ghost_mode;
        setGhostMode(currentConfig.ghost_mode, currentConfig.ghost_opacity);
        return currentConfig.ghost_mode;
      },
    };
  }
  ```
- `e2e/fixtures/app.ts` — ensure `WEAVER_TEST: '1'` is in the env passed to `_electron.launch()` (may already be there from step 2)
- `e2e/tests/window-toggle.spec.ts` — **rewrite** to use the harness for full toggle cycle:

**Rebuild:** Run `turbo build --filter=weaver-electron` after modifying desktop source.

**Rewritten test cases:**
1. **Window starts visible** — `getState().visible` is true, opacity is 1
2. **Toggle hides** — call `toggleWindow()`, `getState().visible` is false, opacity is 0
3. **Toggle shows** — call `toggleWindow()` again, `getState().visible` is true, opacity is 1
4. **Rapid toggles** — call `toggleWindow()` 10 times, final state matches expected parity
5. **Window close intercepted** — `win.close()`, window not destroyed, `getState().visible` is false

**Acceptance:** All 5 tests pass. `turbo build` succeeds. The harness is only active when `WEAVER_TEST=1`.

---

### Step 7: Ghost mode tests

Uses `__weaverTest.setGhostMode()` and `__weaverTest.getState()` from the harness.

**Create:**
- `e2e/tests/ghost-mode.spec.ts`

**Test cases:**
1. **Ghost mode off by default** — `getState().ghostEnabled` is false, opacity is 1
2. **Enable ghost mode** — call `setGhostMode(true, 0.5)`, opacity becomes 0.5, `getState().ghostEnabled` is true
3. **Disable ghost mode** — call `setGhostMode(false, 0.5)`, opacity restores to 1, `getState().ghostEnabled` is false
4. **Ghost + toggle interaction** — enable ghost, `toggleWindow()` to hide, `toggleWindow()` to show → opacity is 0.5 (ghost), not 1
5. **Ghost mode from config** — seed config with `ghost_mode: true, ghost_opacity: 0.3`, launch app, `getState().ghostEnabled` is true, opacity is 0.3

**Acceptance:** All 5 tests pass. Test 5 requires a separate app launch with seeded config.

---

### Step 8: Mini mode tests

Mini mode is HTTP-driven (`POST /api/navigate`) so it doesn't need the harness for triggering. Uses harness `getState().miniMode` for assertions.

**Create:**
- `e2e/tests/mini-mode.spec.ts`

**Test cases:**
1. **Switch to mini** — `POST /api/navigate { page: "mini" }`, wait for page URL to contain `/mini`, window width becomes 300
2. **Switch back to main** — `POST /api/navigate { page: "sessions" }`, page URL is `/`, window bounds restore to 900×600
3. **IPC mini-resize** — in mini mode, send `mini-resize` IPC via `win.webContents.send('mini-resize', 200)`, window height becomes 200
4. **IPC resize clamped** — send `mini-resize` with value 10, window height is clamped to 60
5. **IPC resize ignored outside mini** — in main mode, send `mini-resize`, window bounds unchanged
6. **Rapid mini/main toggles** — toggle 5 times via API, final bounds match expected mode

**Acceptance:** All 6 tests pass.

---

### Step 9: Tray menu tests

Uses `__weaverTest.toggleWindow()`, `__weaverTest.toggleGhost()` from the harness to test the behaviors that tray menu items trigger.

**Create:**
- `e2e/tests/tray-menu.spec.ts`

**Test cases:**
1. **Tray exists** — evaluate confirms a Tray instance exists (check via `Tray.getAllTrays()` or similar)
2. **Show/Hide behavior** — call `toggleWindow()` via harness, verify opacity toggles
3. **Ghost Mode behavior** — call `toggleGhost()` via harness, verify `getState().ghostEnabled` toggles and opacity changes
4. **Mini Mode behavior** — call `POST /api/navigate` to toggle mini, verify window resizes
5. **Quit behavior** — call `app.exit()`, verify process exits

**Acceptance:** All 5 tests pass. Test 5 should be last since it terminates the app.

---

### Step 10: SSE navigation tests

All HTTP-driven — no harness needed.

**Create:**
- `e2e/tests/navigation.spec.ts`

**Test cases:**
1. **Navigate to sessions** — `POST /api/navigate { page: "sessions" }`, page URL becomes `/`
2. **Navigate to mini** — `POST /api/navigate { page: "mini" }`, page URL becomes `/mini`
3. **View by PID** — seed a session, `POST /api/view { pid }`, page URL becomes `/sessions/:id`
4. **View unknown PID** — `POST /api/view { pid: 99999 }`, returns 404
5. **Navigate invalid page** — `POST /api/navigate { page: "nonexistent" }`, no crash, page URL unchanged

**Acceptance:** All 5 tests pass.

---

### Step 11: Config lifecycle tests

All HTTP-driven — no harness needed.

**Create:**
- `e2e/tests/config.spec.ts`

**Test cases:**
1. **Default config on fresh start** — `GET /api/config` returns `DEFAULT_CONFIG` values
2. **Update config** — `PUT /api/config` with `{ dark_mode: false, page_size: 50 }`, `GET /api/config` reflects changes
3. **Config persists to disk** — after PUT, read `<tmpDir>/.weaver/config.json` directly, verify contents match
4. **Invalid config rejected** — `PUT /api/config` with `{ webhook_format: "invalid" }`, returns 422 with warning message
5. **Partial invalid config** — `PUT /api/config` with `{ dark_mode: false, page_size: 999 }`, returns 422

**Acceptance:** All 5 tests pass.

---

### Step 12: Session CRUD tests

All HTTP-driven — no harness needed. Uses seed helpers.

**Create:**
- `e2e/tests/sessions.spec.ts`

**Test cases:**
1. **Empty state** — `GET /api/sessions` returns `[]`
2. **Seeded sessions appear** — seed 2 sessions, `GET /api/sessions` returns both, sorted by startTime desc
3. **Session detail** — seed session + log events, `GET /api/sessions/:id` returns session with turns
4. **Rename session** — `PATCH /api/sessions/:id { customName: "my-session" }`, name persists in subsequent GET
5. **Delete session** — `DELETE /api/sessions/:id`, session removed from list, log file deleted from disk
6. **Get non-existent session** — `GET /api/sessions/fake-id` returns 404
7. **Delete non-existent session** — `DELETE /api/sessions/fake-id` returns 404

**Acceptance:** All 7 tests pass.

---

### Step 13: Clean shutdown tests

Add shutdown verification to the app lifecycle suite.

**Modify:**
- `e2e/tests/app-lifecycle.spec.ts` — add a new `test.describe` block for shutdown:

**Test cases:**
1. **Quit unregisters shortcuts** — evaluate `globalShortcut.isRegistered('F5')` before quit (true), trigger quit, verify app process exits
2. **Server process terminates** — after app close, `GET /api/health` on port 8143 fails (connection refused)
3. **Window close hides, doesn't quit** — close the window, app process still running, window still exists

**Acceptance:** All 3 tests pass.

---

### Step 14: CI integration and final polish

Wire everything together for CI and verify the full suite.

**Modify:**
- `e2e/playwright.config.ts` — add `retries: process.env.CI ? 2 : 0`, add `reporter: process.env.CI ? 'github' : 'list'`
- Root `package.json` — verify `test:e2e` script works from root

**Verify:**
- Run `npm run build` from root (turbo builds all packages)
- Run `npm run test:e2e` from root — all tests pass
- Run `npm test --prefix e2e` directly — all tests pass
- Verify temp directories are cleaned up (no leftover `/tmp/weaver-e2e-*` dirs)

**Acceptance:** Full suite passes end-to-end from a clean build. No test pollution between runs.

---

## Test case summary

| Suite | File | Cases |
|---|---|---|
| App Lifecycle | `app-lifecycle.spec.ts` | 5 + 3 (shutdown) |
| Window Toggle | `window-toggle.spec.ts` | 5 |
| Ghost Mode | `ghost-mode.spec.ts` | 5 |
| Mini Mode | `mini-mode.spec.ts` | 6 |
| Tray Menu | `tray-menu.spec.ts` | 5 |
| Navigation | `navigation.spec.ts` | 5 |
| Config | `config.spec.ts` | 5 |
| Sessions | `sessions.spec.ts` | 7 |
| **Total** | | **46** |

---

## Risks and mitigation

| Risk | Mitigation |
|---|---|
| Port 8143 conflict between parallel runs | Tests are sequential by default; Playwright's `workers: 1` in config prevents parallel app launches |
| Electron launch flakiness in CI | 60s timeout on app fixture; health check polls with retries; CI gets 2 retries per test |
| `HOME` override breaks Electron internals | Electron's own app data (`app.getPath('userData')`) derives from HOME, but we don't depend on it; the app only reads `~/.weaver` |
| CJS module scoping blocks evaluate access | Solved by `global.__weaverTest` harness, guarded by `WEAVER_TEST` env var |
| No `win.getIgnoreMouseEvents()` getter | Assert via `getState()` harness which tracks the internal `ghostEnabled`/`visible` booleans |
| Tray/shortcut tests are indirect | Accepted tradeoff — we test the behavior functions, not the OS-level triggers. The wiring is 1-2 lines of code in `main.ts` |
| Build artifacts stale | `turbo build` dependency in `test:e2e` task ensures fresh build |
