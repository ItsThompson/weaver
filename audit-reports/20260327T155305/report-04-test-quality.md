# Audit Report: Test Quality and Architecture

### Summary

The codebase has 69 unit test files and 10 E2E specs, with generally strong assertion quality and good coverage of pure logic modules. However, the testing strategy is overwhelmingly solitary: nearly every test file mocks all internal collaborators, violating the project's own "sociable tests by default" standard. Critical coverage gaps exist in the desktop package (0 tests), client hooks/context providers (0 tests for 7 modules), and the server entry point. The `hook-handler` validation tests mock 4 sibling modules within the same bounded context, meaning the integration seams where bugs actually hide are never exercised.

### Findings

---

- **Area**: `hook-handler/src/validate/run-validation/` — `run-validation.test.ts`, `stop-trigger.test.ts`, `post-tool-use-trigger.test.ts`
- **Observation**: All three test files import `../../../__test-helpers__/mock-validate-deps.ts`, which mocks four internal collaborators:
  ```ts
  // mock-validate-deps.ts
  vi.mock("../../config/index", () => ({
    readProjectConfig: vi.fn(),
    resolveTestRunners: vi.fn<() => string[]>(),
    findNearestConfig: vi.fn(),
    groupFilesByConfig: vi.fn(),
  }));
  vi.mock("../../changed-files/index", ...);
  vi.mock("../../agent-tests/index", ...);
  vi.mock("../../scope/index", ...);
  ```
  These are all sibling modules within the `hook-handler` package — the same bounded context. The project's testing standard explicitly says: "What should NOT be mocked: Sibling modules that are part of the same bounded context." The only legitimate mocks here are `node:child_process` (spawnSync) and `node:fs`. The real `extractChangedFiles`, `groupFilesByConfig`, `findNearestConfig`, `resolveTestRunners`, `extractAgentTestedDirs`, and `resolveTestDirs` are never exercised together in any test.
- **Impact**: The integration between config resolution, file grouping, changed-file extraction, and validation execution is completely untested. A bug in how `groupFilesByConfig` interacts with `extractChangedFiles` would not be caught. These are the seams where real bugs hide — the individual functions are simple, but their composition is where complexity lives.
- **Suggestion**: Write sociable tests for `runStopTrigger` and `runPostToolUseTrigger` that use real implementations of `extractChangedFiles`, `groupFilesByConfig`, `findNearestConfig`, and `resolveTestRunners`. Mock only `spawnSync` (external process) and `node:fs` (filesystem). This may require creating a test fixture directory structure.
- **Severity**: High

---

- **Area**: `server/src/routes/` — all 7 route test files
- **Observation**: Every route test imports `../../__tests__/mocks/services.ts`, which blanket-mocks 8 service modules with 30+ mock functions:
  ```ts
  // services.ts
  vi.mock("../../services/storage/index", () => ({
    readSessions: vi.fn(), writeSessions: vi.fn(), isProcessRunning: vi.fn(), ...
  }));
  vi.mock("../../services/log-parser/index", () => ({
    parseLogFile: vi.fn(), groupEventsByTurn: vi.fn(), ...
  }));
  vi.mock("../../services/orphan-storage/index", ...);
  vi.mock("../../services/skill-resolver/index", ...);
  vi.mock("../../services/event-bus", ...);
  vi.mock("../../services/webhook/index", ...);
  vi.mock("../../services/skill-graph/index", ...);
  vi.mock("../../utils/logger", ...);
  ```
  Route tests then assert on HTTP status codes and response shapes, but the actual service logic is never exercised. For example, `sessions.test.ts` mocks `readSessions`, `isProcessRunning`, `parseLogFile`, `groupEventsByTurn`, `extractActiveSkillPaths`, and `resolveConfiguredSkills` — all internal collaborators.
- **Impact**: Route tests verify only the HTTP layer (status codes, JSON shape, parameter validation). A refactor of how `readSessions` returns data or how `groupEventsByTurn` structures turns would not be caught by these tests. The route handlers are thin, so the real value would be in testing the route + service integration.
- **Suggestion**: For the most critical routes (GET `/api/sessions/:id`, POST `/api/rename`), write a small number of integration tests that use real service implementations with a mocked filesystem. The route tests can remain as-is for HTTP contract testing, but they shouldn't be the only coverage.
- **Severity**: High

---

- **Area**: `desktop/src/` — 8 source files, 0 test files
- **Observation**: The desktop package contains `main.ts`, `window.ts`, `tray.ts`, `config.ts`, `server.ts`, `sse.ts`, `install-cli.ts`, and `preload.ts`. None have unit tests. The E2E tests cover some behavior (ghost mode, tray menu, window toggle) via `electronApp.evaluate()`, but the individual modules are untested. For example, `server.ts` (2145 bytes) manages the embedded server lifecycle, and `config.ts` (1009 bytes) handles config-driven initialization — both have non-trivial logic.
- **Impact**: Any refactoring of desktop modules has no safety net beyond E2E tests, which are slow and coarse-grained. The `install-cli.ts` module (1437 bytes) handles symlink creation and PATH detection — logic that could easily regress.
- **Suggestion**: Extract pure logic from desktop modules (e.g., config parsing, path resolution in `install-cli.ts`) into testable functions. The Electron-specific code can remain untested at the unit level since E2E covers it.
- **Severity**: High

---

- **Area**: `client/src/hooks/` and `client/src/context/` — 7 modules with 0 tests
- **Observation**: The following hooks and context providers have no test files:
  - `useSessionEvents` (SSE event handling with debounce logic)
  - `useSessionNotifications` (notification dispatch based on activity changes)
  - `useNavigateOnView` (SSE-driven navigation with route mapping)
  - `useWindowList` (derives command palette entries from sessions + skills)
  - `WindowContext` (window state management)
  - `NotificationContext` (notification queue management)
  - `ActivityLogContext` (activity log state)

  The `useSessionEvents` hook contains debounce logic with `setTimeout` and `Map`-based pending state — exactly the kind of stateful logic that benefits from unit tests. The `useNavigateOnView` hook has route mapping logic (`PAGE_ROUTES`) and conditional navigation that could regress.

- **Impact**: These hooks orchestrate core UI behavior (real-time updates, notifications, navigation). Bugs in debounce timing, notification deduplication, or route mapping would only be caught by manual testing or E2E.
- **Suggestion**: Test `useSessionEvents` and `useNavigateOnView` with `renderHook` and the `MockEventSource` already defined in `client/__tests__/setup.ts`. Test `useWindowList` as a pure derivation (it's essentially a `useMemo` over query data). Context providers can be tested through the hooks that consume them.
- **Severity**: Medium

---

- **Area**: `server/src/services/log-parser/parse.test.ts`
- **Observation**: The test imports and manipulates an internal export:

  ```ts
  import { parseLogFile, getLastEvent, _logCache } from "./parse";

  beforeEach(() => {
    vi.clearAllMocks();
    _logCache.clear();
  });
  ```

  The `_logCache` is exported from `parse.ts` with an underscore prefix (signaling it's internal), and the test reaches into it to reset cache state between tests. The source file exports it explicitly: `export const _logCache = logCache;`. This couples the test to the internal caching implementation.

- **Impact**: If the caching strategy changes (e.g., switching from `FileCache` to an LRU cache, or removing caching entirely), the test would break even though the public behavior is unchanged. The test is testing implementation, not behavior.
- **Suggestion**: Either expose a public `clearLogCache()` function for test use, or restructure the test to not depend on cache state (e.g., by using unique session IDs per test so cache hits don't occur).
- **Severity**: Medium

---

- **Area**: `server/src/services/webhook/__tests__/webhook-simple.test.ts` and `webhook-advanced.test.ts`
- **Observation**: The webhook tests mock `deriveActivity` (a pure function from `log-parser`):
  ```ts
  // webhook-helpers.ts
  vi.mock("../../log-parser", () => ({
    parseLogFile: vi.fn(),
    deriveActivity: vi.fn(),
  }));
  ```
  Then in `setupWebhookTests`:
  ```ts
  vi.mocked(deriveActivity).mockImplementation((name: string) => {
    if (name === "agentSpawn") return "starting";
    if (name === "stop") return "idle";
    if (name === "preToolUse") return "running_tool";
    return "processing";
  });
  ```
  `deriveActivity` is a pure function with no I/O — it maps event names to activity statuses. The mock reimplements the same logic. Mocking `parseLogFile` is legitimate (it does file I/O), but `deriveActivity` should use the real implementation.
- **Impact**: If `deriveActivity` adds a new mapping (e.g., a new event type), the webhook tests would silently use stale mock behavior instead of catching the integration.
- **Suggestion**: Remove the `deriveActivity` mock and use the real implementation. It's a pure function with no side effects.
- **Severity**: Medium

---

- **Area**: `hook-handler/src/validate/` — 5 test files with duplicated `spawnResult` helper
- **Observation**: The `spawnResult()` helper function is copy-pasted across 5 test files:
  - `run-validation/run-validation.test.ts` (line 29)
  - `run-validation/stop-trigger.test.ts` (line 25)
  - `run-validation/post-tool-use-trigger.test.ts` (line 20)
  - `stop-hook/stop-hook.test.ts` (line 13)
  - `commands/commands.test.ts` (line 11)

  Similarly, `makeGroups()` is duplicated in `run-validation.test.ts` and `stop-trigger.test.ts`. Each copy is identical:

  ```ts
  function spawnResult(
    overrides: Partial<SpawnSyncReturns<string>> = {},
  ): SpawnSyncReturns<string> {
    return {
      pid: 1,
      output: [],
      stdout: "",
      stderr: "",
      status: 0,
      signal: null,
      error: undefined,
      ...overrides,
    };
  }
  ```

- **Impact**: When the helper needs to change (e.g., adding a new default field), all 5 copies must be updated. This is a maintenance burden and a source of subtle inconsistencies.
- **Suggestion**: Extract `spawnResult` and `makeGroups` into `hook-handler/src/__test-helpers__/spawn.ts` and import from there, following the existing `__test-helpers__` pattern.
- **Severity**: Low

---

- **Area**: `server/src/services/webhook/context.test.ts` vs `server/src/services/log-parser/test-helpers.ts`
- **Observation**: `context.test.ts` defines its own local `makeEvent` function:
  ```ts
  function makeEvent(
    name: string,
    extra: Record<string, unknown> = {},
  ): HookEvent {
    return {
      timestamp: "2026-01-01T00:00:00Z",
      event: { hook_event_name: name, cwd: "/tmp", ...extra },
    };
  }
  ```
  This is nearly identical to the shared `makeEvent` in `log-parser/test-helpers.ts` (which uses `new Date().toISOString()` instead of a fixed timestamp) and the one in `webhook-helpers.ts`. Three separate `makeEvent` implementations exist in the server package alone, plus one in `hook-handler/src/__test-helpers__/events.ts` and one in `e2e/fixtures/seed.ts`.
- **Impact**: Minor inconsistency. The `context.test.ts` version uses a fixed timestamp while others use dynamic timestamps. This doesn't cause bugs but adds cognitive overhead when reading tests.
- **Suggestion**: Consolidate into a single `makeEvent` in `server/src/__tests__/fixtures/events.ts` with an optional timestamp parameter.
- **Severity**: Low

---

- **Area**: E2E test coverage gaps
- **Observation**: The 10 E2E spec files cover: smoke, navigation, sessions CRUD, config lifecycle, ghost mode, tray menu, window toggle, app lifecycle, mini mode, and seed utilities. Missing from E2E coverage:
  - **Cherrypick**: No E2E test for the conversation pruning flow
  - **Webhooks**: No E2E test for webhook dispatch (would require a mock HTTP server)
  - **Validation hooks**: No E2E test for the validation → inject cycle
  - **Orphan management**: No E2E test for orphan assignment/deletion (only unit-tested via `useOrphansPage.test.tsx`)
  - **Skill graph**: No E2E test for skill graph rendering or navigation
- **Impact**: The most complex user-facing features (cherrypick, validation hooks) are only tested at the unit level with mocked dependencies. The end-to-end integration of these features is unverified.
- **Suggestion**: Prioritize E2E coverage for the validation hook cycle (it involves shell scripts, file I/O, server notification, and UI rendering) since it spans the most packages.
- **Severity**: Medium

---

- **Area**: `server/src/index.ts` — server entry point
- **Observation**: The server entry point (2598 bytes) orchestrates Fastify setup, route registration, static file serving, stale session cleanup, PID polling, keep-awake, and graceful shutdown. It has no unit test. The E2E tests exercise it indirectly by launching the full Electron app.
- **Impact**: The startup sequence, error handler registration, and shutdown logic are untested at the unit level. The error handler (`server.setErrorHandler`) logs and formats errors — this behavior is not verified anywhere.
- **Suggestion**: The entry point is mostly wiring code, so the lack of unit tests is acceptable if E2E covers the critical paths. However, the `setErrorHandler` callback could be extracted and unit-tested.
- **Severity**: Low

---

- **Area**: Test organization inconsistency
- **Observation**: The codebase uses two patterns for test file placement:
  1. **Co-located**: `parse.test.ts` next to `parse.ts` (used by most modules)
  2. **`__tests__/` subdirectory**: `webhook/__tests__/webhook-simple.test.ts` (used only by webhook)

  Mock infrastructure also varies:
  - Server: `src/__tests__/mocks/` (centralized)
  - Hook-handler: `src/__test-helpers__/` and `src/validate/__test-helpers__/` (nested)
  - Client: `__tests__/mocks/` (root level) and `src/__tests__/mocks/` (src level)

  Naming conventions are consistent (`.test.ts` suffix), but the structural inconsistency adds friction when navigating the test infrastructure.

- **Impact**: A developer looking for test helpers must check multiple locations. The webhook tests being in `__tests__/` while all other service tests are co-located is surprising.
- **Suggestion**: Standardize on co-located tests with a single `__test-helpers__/` directory per package for shared mock infrastructure.
- **Severity**: Low

---

- **Area**: Client Cloudscape component mocks
- **Observation**: The client tests mock 8 Cloudscape Design System components in `client/__tests__/mocks/`:
  ```
  cloudscape-table.tsx, cloudscape-tabs.tsx, cloudscape-header.tsx,
  cloudscape-text-filter.tsx, cloudscape-passthrough.tsx,
  cloudscape-expandable-section.tsx, cloudscape-button.tsx, cloudscape-flashbar.tsx
  ```
  Each mock renders a simplified DOM structure. For example, `cloudscape-table.tsx`:
  ```tsx
  const Table = ({ items, columnDefinitions, empty, filter }: any) =>
    React.createElement(
      "div",
      {},
      filter,
      items?.length === 0 ? empty : null,
      items?.map((item: any, i: number) =>
        React.createElement(
          "div",
          { key: item.id ?? i },
          columnDefinitions?.map((col: any) =>
            React.createElement("span", { key: col.id }, col.cell(item)),
          ),
        ),
      ),
    );
  ```
  This is a reasonable approach — it avoids the overhead of the full Cloudscape library in tests while preserving the ability to test data flow and user interactions.
- **Impact**: The mocks are well-maintained and cover the components actually used in tests. The risk is that Cloudscape API changes could break production code while tests still pass against the mocks.
- **Suggestion**: This is an acceptable trade-off. No change needed, but consider adding a comment in the mock directory explaining the rationale.
- **Severity**: Low

### Deepening Candidates

- **Cluster**: `hook-handler/src/validate/run-validation/` + `hook-handler/src/config/` + `hook-handler/src/changed-files/` + `hook-handler/src/agent-tests/` + `hook-handler/src/scope/`
- **Why they're coupled**: `runStopTrigger` calls `extractChangedFiles` → `groupFilesByConfig` → `resolveTestRunners` → `extractAgentTestedDirs` → `resolveTestDirs` in sequence. These modules share the `WeaverProjectConfig` type and the concept of "which files changed and what validation to run on them." The config module reads `.weaver.json`, the changed-files module reads git state, and the scope module resolves test directories — all feeding into the validation orchestrator.
- **Dependency category**: In-process (all pure functions or synchronous I/O within the same Node.js process)
- **Test impact**: The 4 mock declarations in `mock-validate-deps.ts` would be eliminated. The existing tests for individual modules (`changed-files.test.ts`, `scope.test.ts`, `find-config.test.ts`, `test-runners.test.ts`) would be replaced by boundary tests on `runStopTrigger` and `runPostToolUseTrigger` that use real implementations with a fixture filesystem. Only `spawnSync` (external process execution) and `node:fs` (filesystem) would remain mocked.

---

- **Cluster**: `server/src/services/webhook/handler.ts` + `payload-simple.ts` + `payload-advanced.ts` + `dispatch.ts` + `context.ts`
- **Why they're coupled**: `handleWebhookEvent` in `handler.ts` calls `readConfig` → `parseLogFile` → `deriveActivity` → `buildPayloadForFormat` (which delegates to either `buildSimpleWebhookPayload` or `buildWebhookPayload`) → `dispatchWebhook`. The `context.ts` module is called by both payload builders. All 5 files share the `HookEvent`, `WebhookPayload`, and `SimpleWebhookPayload` types.
- **Dependency category**: In-process for payload building and context extraction; Remote-but-owned for `dispatchWebhook` (HTTP POST to user-configured URL); Local-substitutable for `readConfig` (filesystem) and `parseLogFile` (filesystem + cache)
- **Test impact**: The current test structure already tests through `handleWebhookEvent` (the public interface), which is good. The `context.test.ts` tests pure logic independently, which is also good. The main improvement would be using the real `deriveActivity` instead of mocking it, and potentially using the real `buildSimpleWebhookPayload`/`buildWebhookPayload` in the handler tests instead of verifying them separately.

### Metrics

- Files examined: 52
- Findings: 12 (3 high, 4 medium, 5 low)
- Deepening candidates: 2
