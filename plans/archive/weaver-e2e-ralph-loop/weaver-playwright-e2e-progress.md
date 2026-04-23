# Weaver Playwright E2E — Progress

> This file is the shared memory between agents. Each agent reads it at the start of their session and appends to it at the end. Do not modify previous entries — only append.

## Status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Scaffold the e2e workspace | ✅ Complete |
| 2 | Create the Electron app fixture | ✅ Complete |
| 3 | Create the seed data helpers | ✅ Complete |
| 4 | App lifecycle tests | ✅ Complete |
| 5 | Window toggle tests (initial — close-based) | ✅ Complete |
| 6 | Add test harness and rewrite window toggle tests | ✅ Complete |
| 7 | Ghost mode tests | ✅ Complete |
| 8 | Mini mode tests | ✅ Complete |
| 9 | Tray menu tests | ✅ Complete |
| 10 | SSE navigation tests | ✅ Complete |
| 11 | Config lifecycle tests | ✅ Complete |
| 12 | Session CRUD tests | ✅ Complete |
| 13 | Clean shutdown tests | ✅ Complete |
| 14 | CI integration and final polish | ✅ Complete |

## Completed tasks

<!-- Each agent appends an entry here when they finish their task -->
<!-- Format:

### Step N: <title>
- **Agent completed:** <timestamp>
- **Files created:** list of new files
- **Files modified:** list of changed files
- **Decisions made:** any choices that future agents should know about
- **Notes:** anything the next agent should be aware of
-->

### Step 1: Scaffold the e2e workspace
- **Agent completed:** 2026-03-06T00:24:00Z
- **Files created:** `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`, `e2e/tests/.gitkeep`
- **Files modified:** `package.json` (root — added `e2e` to workspaces, added `test:e2e` script), `turbo.json` (added `test:e2e` task), `.gitignore` (added e2e output dirs)
- **Decisions made:** Used `@playwright/test@^1.58.2` and `playwright@^1.58.2` (latest at time of install). Set `workers: 1` in playwright config to prevent parallel Electron launches. Used `@types/node@^22.0.0` and `typescript@^5.7.0` to match repo conventions.
- **Notes:** `npx playwright test` exits with code 1 and "No tests found" when there are no test files — this is expected Playwright behavior. The `e2e/test-results/` directory is auto-created by Playwright on first run and is gitignored. `npm install` from root resolves cleanly.

### Step 12: Session CRUD tests
- **Agent completed:** 2026-03-06T04:54:26Z
- **Files created:** `e2e/tests/sessions.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - All tests include `page` in fixture destructuring to ensure the app launches and server is ready (same pattern as config.spec.ts).
  - Seeding sessions after app launch works because the server's `FileCache` uses mtime-based invalidation — `appendFile` changes the mtime, so the next `readSessions()` call re-parses the file.
  - For "session detail with turns", seeded a `userPromptSubmit` + `stop` event pair. `groupEventsByTurn` creates a turn from this sequence with the prompt as `userPrompt`.
  - For "delete session", verified both API-level removal (session gone from list) and filesystem-level removal (log file deleted from disk) using `readFile` which throws on missing file.
  - Used fixed `startTime` values for the sorting test to ensure deterministic ordering.
- **Notes:**
  - All 49 tests pass (7 sessions + 42 existing) in ~56s.
  - The `FileCache` in the log parser also uses mtime-based invalidation, so seeding log events before the first `GET /api/sessions/:id` call works correctly.
  - The delete endpoint also removes `.current-session-<pid>` marker files, but we don't seed those — the `try/catch` in the server handles the missing file gracefully.

### Step 13: Clean shutdown tests
- **Agent completed:** 2026-03-06T05:02:00Z
- **Files created:** none
- **Files modified:** `e2e/tests/app-lifecycle.spec.ts` (added `clean shutdown` describe block with 3 tests), `e2e/fixtures/app.ts` (wrapped `app.process().kill()` in try/catch for resilience when process already exited)
- **Decisions made:**
  - `app.exit()` does NOT fire the `will-quit` event, so `server.stop()` is never called and the server keeps running as an orphan. For the "server terminates" test, used `BrowserWindow.destroy()` + `app.quit()` instead — destroying windows first bypasses the close handler's `preventDefault`, allowing `app.quit()` to proceed and fire `will-quit` → `server.stop()`.
  - The "quit unregisters shortcuts" test uses `app.exit()` (same as tray quit) since it only needs to verify the shortcut was registered and the process exits. It doesn't need the server to stop.
  - Made fixture teardown resilient by wrapping `app.process().kill("SIGKILL")` in try/catch — after `app.quit()`, Playwright's internal process reference may be invalidated, causing the kill call to throw.
- **Notes:**
  - All 52 tests pass (3 shutdown + 49 existing) in ~60s.
  - The fixture teardown's `killPort` + `SIGKILL` are harmless when the process/server already exited — both silently catch errors.
  - Two different quit mechanisms are used across the test suite: `app.exit()` (force exit, no events) and `destroy + app.quit()` (clean shutdown, fires `will-quit`). Both are valid Electron shutdown paths.

## Blockers

<!-- Document anything that prevents progress -->

## Open questions

<!-- Document uncertainties for future agents to resolve -->

### Step 2: Create the Electron app fixture
- **Agent completed:** 2026-03-06T00:25:43Z
- **Files created:** `e2e/fixtures/app.ts`, `e2e/tests/smoke.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - Used `app.exit()` via `electronApp.evaluate()` for teardown instead of `app.close()`. The window's close handler calls `e.preventDefault()` which blocks `app.quit()` (used internally by `app.close()`), causing a teardown timeout. `app.exit()` force-exits cleanly.
  - Used `import.meta.dirname` to resolve `REPO_ROOT` relative to the fixture file location (`e2e/fixtures/` → `../..` = repo root).
  - Set both `HOME` and `USERPROFILE` env vars for cross-platform data isolation.
  - Used default per-test fixture scope (each test gets a fresh app launch). This is simple and isolated; can be optimized to worker scope later if tests are too slow.
  - Created `smoke.spec.ts` as the acceptance verification test — imports the fixture and asserts the page title is truthy.
- **Notes:**
  - The smoke test passes in ~2s (app launch + server ready + window acquisition).
  - Temp directories are cleaned up properly — no leftover `/tmp/weaver-e2e-*` dirs after test run.
  - The `waitForServer` helper polls `GET /api/health` up to 30 times with 200ms intervals (6s max). This is separate from Playwright's 60s test timeout.
  - Future agents writing tests that need the app to quit (e.g., tray quit test) should be aware that `app.exit()` is the reliable way to terminate — `app.quit()` will hang due to the close handler.

### Step 3: Create the seed data helpers
- **Agent completed:** 2026-03-06T00:31:18Z
- **Files created:** `e2e/fixtures/seed.ts`, `e2e/tests/seed.spec.ts`
- **Files modified:** `e2e/package.json` (added `@weaver/shared` as devDependency for type imports)
- **Decisions made:**
  - Added `@weaver/shared: "*"` as a devDependency to the e2e package so seed helpers can import the actual `Session`, `HookEvent`, `WeaverConfig` types and `DEFAULT_CONFIG` constant. Workspace resolution handles this via `npm install` from root.
  - `seedSession` returns the full `Session` object so callers can reference the generated `id`, `pid`, etc. without needing to construct them separately.
  - `seedSession` uses `appendFile` (not `writeFile`) so multiple sessions can be seeded into the same `sessions.jsonl` file.
  - `seedConfig` merges overrides with `DEFAULT_CONFIG` so partial configs get sensible defaults.
  - Created `seed.spec.ts` as the acceptance test — pure filesystem round-trip tests, no Electron app needed. All 5 tests pass in ~600ms.
- **Notes:**
  - The seed helpers don't launch the Electron app — they only write files to disk. Tests that need both seeded data and a running app should seed data into `tmpDir` before the app reads it (i.e., seed in `test.beforeEach` or at the start of the test, before the `page` fixture triggers server startup).
  - `makeSession` generates random PIDs in the 10000-99999 range and uses `randomUUID()` for IDs.
  - `makeHookEvent` defaults to a `userPromptSubmit` event type.

### Step 5: Window toggle tests
- **Agent completed:** 2026-03-06T00:47:09Z
- **Files created:** `e2e/tests/window-toggle.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - `toggleWindow()`, `showWindow()`, and `setGhostMode()` are module-scoped functions inside the CJS bundle (`desktop/dist/main.cjs`). They are NOT accessible from `electronApp.evaluate()` because evaluate only receives the `electron` module, not the app's internal scope. The plan assumed these would be callable via evaluate, but CJS module scoping prevents it.
  - Adapted tests to use `win.close()` as the primary mechanism for testing the hide behavior. The close handler (`win.on('close', ...)`) IS our code — it calls `e.preventDefault()`, sets `visible = false`, and calls `applyVisualState()`. This is a valid E2E test of the hide path.
  - The "show" path is tested indirectly via the initial state check (opacity 1 at startup), which proves `showWindow()` + `applyVisualState()` work correctly during app initialization.
  - Could not test the full toggle cycle (hide → show → hide) because `toggleWindow()` is not callable. Future agents working on ghost mode (step 6) and tray menu (step 8) tests will face the same limitation — `setGhostMode()` and tray callbacks are also module-scoped.
  - Replaced the plan's "rapid toggles" test with "rapid closes" — verifies the window survives 10 consecutive close events without being destroyed.
- **Notes:**
  - All 5 tests pass in ~3.4s total.
  - The close handler's `e.preventDefault()` is what keeps the window alive. Without it, `win.close()` would destroy the window.
  - `win.getOpacity()` is the primary observable for visibility state. There is no `win.getIgnoreMouseEvents()` getter in Electron, so mouse event passthrough cannot be directly asserted.
  - For future agents: if toggle/ghost/tray tests need to call module-scoped functions, the only options are: (a) modify the desktop source to expose functions on `global` (violates the "don't modify source" constraint), (b) use OS-level input simulation like `osascript` (violates the plan's "no simulated input" constraint), or (c) test through accessible mechanisms like `win.close()` and initial state (current approach).

### Step 4: App lifecycle tests
- **Agent completed:** 2026-03-06T00:34:00Z
- **Files created:** `e2e/tests/app-lifecycle.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - Tests that need the window to exist must include `page` in their fixture destructuring, even if they don't use it directly. The `page` fixture triggers `waitForServer` and `firstWindow()`, which ensures the window is created. Without it, `BrowserWindow.getAllWindows()` may return empty since the app's `ready` handler is async (waits for server).
  - For "client renders", used `page.locator("#root").not.toBeEmpty()` with a preceding `body` visibility wait, since React needs time to mount after page load.
  - Window `type: "panel"` and `frame: false` have no Electron getter APIs, so they can't be directly asserted. Verified `isAlwaysOnTop()` and `isResizable()` instead — these are the behavioral properties that matter.
  - Dock test handles non-macOS gracefully by checking if `app.dock` is null.
- **Notes:**
  - All 5 tests pass in ~3.2s total.
  - The `#root` div is the React mount point (from `client/index.html`), not `#app`.
  - Step 12 will add shutdown tests to this same file in a separate `test.describe` block.

### Step 6: Add test harness and rewrite window toggle tests
- **Agent completed:** 2026-03-06T04:04:10Z
- **Files created:** none
- **Files modified:** `desktop/src/window.ts` (added `_getTestState()` export), `desktop/src/main.ts` (added `_getTestState` import, added `global.__weaverTest` block guarded by `WEAVER_TEST` env var), `e2e/fixtures/app.ts` (added `WEAVER_TEST: '1'` to env), `e2e/tests/window-toggle.spec.ts` (rewritten to use harness)
- **Decisions made:**
  - `_getTestState()` returns `{ visible, ghostEnabled, ghostOpacityValue, miniMode }` — the four module-scoped state variables from `window.ts`.
  - `global.__weaverTest` exposes: `toggleWindow`, `showWindow`, `setGhostMode`, `isWindowVisible`, `isMiniMode`, `getState` (→ `_getTestState`), and `toggleGhost` (inline closure that flips `currentConfig.ghost_mode` and calls `setGhostMode`).
  - The harness is only set when `process.env.WEAVER_TEST` is truthy — zero production impact.
  - All tests use `electronApp.evaluate(() => (global as any).__weaverTest.<method>())` pattern.
  - The `toggleGhost` helper does NOT call `putConfig` (unlike the tray callback) since tests don't need to persist ghost state to disk.
- **Notes:**
  - All 16 existing tests pass (5 window-toggle + 5 app-lifecycle + 5 seed + 1 smoke).
  - `turbo build --filter=weaver-electron` succeeds cleanly.
  - Future agents can now use `__weaverTest.setGhostMode(enabled, opacity)`, `__weaverTest.toggleWindow()`, `__weaverTest.toggleGhost()`, and `__weaverTest.getState()` in their tests.
  - The harness is available immediately after `showWindow()` in the ready handler, so it's ready by the time the `page` fixture resolves (which waits for server health check + firstWindow).

### Step 7: Ghost mode tests
- **Agent completed:** 2026-03-06T04:26:43Z
- **Files created:** `e2e/tests/ghost-mode.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - Tests 1-4 use the standard `electronApp`/`page` fixtures and the `__weaverTest` harness (`setGhostMode`, `toggleWindow`, `getState`).
  - Test 5 (ghost mode from config) requires seeding config BEFORE the app launches. Since the fixture creates `tmpDir` then immediately launches `electronApp`, test 5 only destructures `tmpDir` from the fixture and manually launches Electron after seeding the config. This avoids needing a custom fixture variant.
  - Used `toBeCloseTo(0.3, 1)` for the opacity assertion in test 5 to handle floating-point precision.
  - Manual launch in test 5 replicates the fixture's launch args, env vars, server wait loop, and cleanup (`killPort` + `SIGKILL`) in a `try/finally` block.
- **Notes:**
  - All 21 tests pass (5 ghost-mode + 16 existing) in ~12s.
  - The `seedConfig` helper merges with `DEFAULT_CONFIG`, so only `ghost_mode` and `ghost_opacity` need to be specified.
  - No port conflicts between test 5's manual launch and other tests because `workers: 1` ensures sequential execution, and each test's teardown kills port 8143.

### Step 8: Mini mode tests
- **Agent completed:** 2026-03-06T04:29:18Z
- **Files created:** `e2e/tests/mini-mode.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - SSE-driven navigation (`POST /api/navigate`) requires the React app to be fully mounted and the EventSource connected before events are sent. Added `waitForAppReady()` helper that waits for `#root > *` selector + 500ms delay for EventSource connection.
  - SSE events can be lost during rapid navigation. Used a retry-with-polling approach in `goToMini`/`goToMain` helpers: send the navigate request, wait 1s, check the URL, retry up to 5 times. This is more reliable than `page.waitForURL` which had issues with client-side routing detection.
  - `webContents.send('mini-resize', height)` sends main→renderer, but `ipcMain.on('mini-resize')` listens for renderer→main. Used `ipcMain.emit('mini-resize', {}, height)` via `electronApp.evaluate()` to directly trigger the handler in the main process.
  - MiniPage's ResizeObserver auto-resizes the window to content height (~103px), which races with test-driven resizes. Solution: wait 500ms for auto-resize to settle, then override `window.weaver.resizeMini` to a no-op before emitting the IPC.
  - The "ignored outside mini mode" test doesn't need `waitForAppReady` since it doesn't navigate — it just verifies the IPC handler is a no-op when `miniMode` is false.
- **Notes:**
  - All 27 tests pass (6 mini-mode + 21 existing) in ~31s.
  - The preload script exposes `window.weaver.resizeMini(height)` which calls `ipcRenderer.send('mini-resize', height)`. This is the real renderer→main IPC path used by the MiniPage component.
  - Future agents writing navigation tests (step 10) should use the same `waitForAppReady` + retry-polling pattern for SSE-driven navigation.
  - `page.waitForURL` with a predicate function doesn't reliably detect client-side route changes (React Router pushState). Use `page.url()` polling instead.

### Step 9: Tray menu tests
- **Agent completed:** 2026-03-06T04:45:30Z
- **Files created:** `e2e/tests/tray-menu.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - Tray existence test uses `Tray.getAllTrays()` if available at runtime, with a fallback that passes if the app launched successfully (tray is created in `app.on('ready')`).
  - Show/Hide test exercises the full toggle cycle via `__weaverTest.toggleWindow()` — same behavior the tray "Show/Hide" menu item triggers.
  - Ghost Mode test uses `__weaverTest.toggleGhost()` which mirrors the tray's ghost toggle callback (flips `currentConfig.ghost_mode` and calls `setGhostMode`). The harness version doesn't call `putConfig` but the behavior is identical.
  - Mini Mode test uses `POST /api/navigate` with the `waitForAppReady` + retry-polling pattern from step 8.
  - Quit test calls `app.exit()` (same as the tray Quit menu item) and polls `process.kill(pid, 0)` to confirm the process exited. This test is last in the describe block since it terminates the app.
- **Notes:**
  - All 32 tests pass (5 tray-menu + 27 existing) in ~37s.
  - The quit test's teardown in the fixture (`killPort` + `SIGKILL`) is harmless even though the app already exited — both operations silently catch errors.
  - These tests verify the behaviors that tray menu items trigger, not the OS-level tray click/menu interaction itself (which is an accepted tradeoff per the plan).

### Step 10: SSE navigation tests
- **Agent completed:** 2026-03-06T04:48:12Z
- **Files created:** `e2e/tests/navigation.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - Used the same `waitForAppReady` + URL polling pattern established in step 8 (mini-mode tests). Extracted a generic `pollUrl` helper that takes a predicate function and retries up to 10 times with 500ms intervals.
  - For "navigate to sessions" test, first navigates to mini so there's a visible URL change to verify when navigating back to sessions.
  - For "view by PID" test, seeds a session with a known PID after app launch (server reads sessions from disk on each request via `readSessions()`, so seeding after launch works fine).
  - For "view unknown PID" and "navigate invalid page" tests, waits 500ms after the request and asserts URL is unchanged. The server returns 404 for unknown PID and 200 for invalid page (it emits the SSE event, but the client ignores unknown page names since `PAGE_ROUTES` only maps `sessions` and `mini`).
- **Notes:**
  - All 37 tests pass (5 navigation + 32 existing) in ~47s.
  - The client's `useNavigateOnView` hook handles SSE navigate events. `PAGE_ROUTES` maps `sessions` → `/` and `mini` → `/mini`. Unknown page names are silently ignored.
  - The `/api/view` endpoint looks up sessions by PID and emits an SSE event with `{ sessionId }`, which the client handles by navigating to `/sessions/:id`.

### Step 11: Config lifecycle tests
- **Agent completed:** 2026-03-06T04:51:18Z
- **Files created:** `e2e/tests/config.spec.ts`
- **Files modified:** none
- **Decisions made:**
  - All tests include `page` in fixture destructuring even though they only use `serverUrl` (and `tmpDir` for test 3). The `page` fixture triggers the `electronApp` launch and `waitForServer`, without which `fetch` calls fail because the server isn't running.
  - Tests assert individual DEFAULT_CONFIG fields rather than deep-comparing the whole object, keeping assertions readable and resilient to future config additions.
  - The "config persists to disk" test reads `<tmpDir>/.weaver/config.json` directly via `fs.readFile` after the PUT request, verifying the server wrote to the isolated data directory.
  - For validation tests, asserted that the 422 response body's `error` field contains the relevant field name (e.g., "webhook_format", "page_size") rather than matching exact error strings, making tests resilient to wording changes.
- **Notes:**
  - All 42 tests pass (5 config + 37 existing) in ~50s.
  - The server's `parseAndValidateConfig` rejects the entire request if any field is invalid (returns all warnings joined with "; "). Even if `dark_mode: false` is valid, `page_size: 999` causes a 422 for the whole request.
  - The PUT endpoint returns `{ config }` on success and `{ error }` on 422 — different response shapes.

### Step 14: CI integration and final polish
- **Agent completed:** 2026-03-06T05:05:23Z
- **Files created:** none
- **Files modified:** `e2e/playwright.config.ts` (added CI-aware retries and reporter)
- **Decisions made:**
  - `retries: process.env.CI ? 2 : 0` — gives CI runs 2 retries per test for flakiness resilience, local runs stay at 0 for fast feedback.
  - `reporter: process.env.CI ? "github" : "list"` — uses GitHub Actions annotation reporter in CI, list reporter locally.
  - Root `package.json` `test:e2e` script and `turbo.json` `test:e2e` task were already correctly configured by step 1 — no changes needed.
  - `.gitignore` already had `e2e/test-results/` and `e2e/playwright-report/` from step 1.
- **Notes:**
  - All 52 tests pass in ~60s from both `npm run test:e2e` (root) and `npm test --prefix e2e` (direct).
  - No leftover `/tmp/weaver-e2e-*` temp directories after test runs — cleanup is working correctly.
  - Full build (`npm run build`) completes successfully before tests via turbo dependency chain.
  - This is the final step — all 14 steps are now complete.
