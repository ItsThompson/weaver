# Audit Report: Testability Gaps

### Summary

The monorepo has 100 test files (73 `.test.ts` + 27 `.test.tsx`) with generally strong coverage of pure logic and utility functions. The most significant gaps are: the desktop package has zero tests despite containing testable parsing and state logic; the lifecycle module's interval-based orchestration and PID-tracking state are completely untested; the CherrypickPage feature (page, hook, 5 components) has no tests at all; and server route tests mock every internal service, meaning the route→service integration path is never exercised.

### Findings

- **Area**: `server/src/services/storage/lifecycle.ts` — `startStaleSessionCleanup`, `startPidPolling`, `stopStaleSessionCleanup`
- **Observation**: The test file `lifecycle.test.ts` covers only the pure functions `cleanStaleSessions` and `isProcessRunning`. The three orchestration functions that manage module-level state are never tested. `startPidPolling` contains the most complex logic — it polls sessions, tracks PIDs in a module-level `openPids: Set<number>`, detects when a PID disappears, and fires an `onSessionClosed` callback. None of this is exercised:

  ```typescript
  // lifecycle.ts — untested
  const openPids = new Set<number>();

  export function startPidPolling(
    onSessionClosed: (sessionId: string) => void,
  ): void {
    const poll = async () => {
      const sessions = await readSessions();
      const currentPids = sessions.reduce((acc, s) => { ... }, new Set<number>());
      openPids.forEach((pid) => {
        if (currentPids.has(pid)) return;
        const session = sessions.find((s) => s.pid === pid);
        if (session) onSessionClosed(session.id);
      });
      openPids.clear();
      currentPids.forEach((pid) => openPids.add(pid));
    };
    poll();
    pidPollInterval = setInterval(poll, PID_POLL_INTERVAL_MS);
  }
  ```

  The `openPids` Set persists across calls and would leak between tests if tested naively. There is no `reset()` or factory pattern to isolate test runs.

- **Impact**: The PID polling logic is the mechanism that detects session closure and triggers webhooks/UI updates. A bug here (e.g., race condition in the reduce, incorrect PID tracking across poll cycles) would silently break session lifecycle detection. The module-level state makes it impossible to test multiple scenarios without careful teardown.
- **Suggestion**: Test `startPidPolling` with fake timers, mocking `readSessions` and `isProcessRunning`. Add an `afterEach` that calls `stopStaleSessionCleanup()` to clear intervals and reset state. Alternatively, refactor to a factory function that returns the polling controller with encapsulated state.
- **Severity**: High

---

- **Area**: `client/src/pages/CherrypickPage/` — entire feature untested (page, hook, 5 components)
- **Observation**: Zero test files exist anywhere under `CherrypickPage/`. The hook `useCherrypick.ts` implements a 3-phase state machine (upload → edit → preview) with file parsing, set-based selection tracking, blob download, and phase transitions. The page component delegates entirely to this hook. The 5 sub-components (`UploadPhase`, `EditPhase`, `PreviewPhase`, `ExchangeSummaryLine`, `ExchangeSection`) are also untested. While the utility functions it depends on (`parseConversation` in `group-exchanges.test.ts`, `pruneConversation` in `prune-conversation.test.ts`) are well-tested, the hook's orchestration of those utilities and its state management are not:
  ```typescript
  // useCherrypick.ts — untested state machine
  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string) as SavedConversation;
        if (!json.history || !json.conversation_id) {
          setError("Invalid file: missing history or conversation_id");
          return;
        }
        const parsed = parseConversation(json);
        setPageState({ phase: "edit", parsed, fileName: file.name });
      } catch {
        setError("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
  }, []);
  ```
- **Impact**: The cherrypick feature is a core user workflow. The state machine has multiple edge cases (invalid files, empty selections, phase transitions, download blob creation) that are only validated manually. A regression in phase transitions or selection logic would go undetected.
- **Suggestion**: Test `useCherrypick` as a hook with `renderHook`. Mock `FileReader` to simulate file upload. Verify phase transitions, error states, selection toggling, and that `handlePreview` correctly calls `pruneConversation` with the accumulated selection sets.
- **Severity**: High

---

- **Area**: `server/src/routes/` — all route tests mock every internal service via shared mock file
- **Observation**: Every route test file imports `../../__tests__/mocks/services` which mocks 7 service modules wholesale:
  ```typescript
  // server/src/__tests__/mocks/services.ts
  vi.mock("../../services/storage/index", () => ({ readSessions: vi.fn(), writeSessions: vi.fn(), ... }));
  vi.mock("../../services/log-parser/index", async () => ({ parseLogFile: vi.fn(), getLastEvent: vi.fn(), ... }));
  vi.mock("../../services/orphan-storage/index", () => ({ readOrphanEvents: vi.fn(), ... }));
  vi.mock("../../services/skill-resolver/index", () => ({ skillNameFromPath: vi.fn(), ... }));
  vi.mock("../../services/event-bus", () => ({ broadcast: vi.fn(), emit: vi.fn(), sseReply: vi.fn() }));
  vi.mock("../../services/webhook/index", () => ({ handleWebhookEvent: vi.fn(), ... }));
  vi.mock("../../services/skill-graph/index", () => ({ buildSkillGraph: vi.fn(), ... }));
  ```
  The project's testing standard is "sociable tests by default — only mock truly external dependencies (network, filesystem, timers)." The services being mocked are in-process collaborators, not external dependencies. This means the route→service integration path is never exercised. For example, `sessions.test.ts` mocks `parseLogFile` and `getLastEvent` rather than letting the real log parser process fixture data through the route handler.
- **Impact**: Bugs at the integration boundary (e.g., a route passing wrong arguments to a service, or a service returning a shape the route doesn't expect) would not be caught. The shared mock file also creates a maintenance burden — any service API change requires updating the mock file, and the mock may drift from reality.
- **Suggestion**: For key routes (GET /api/sessions/:id, POST /api/notify), write sociable tests that mock only the filesystem layer (`node:fs/promises`) and let the real services run. The existing mock-heavy tests can remain as fast unit tests, but at least one sociable test per route would catch integration issues.
- **Severity**: Medium

---

- **Area**: `desktop/src/` — 8 source files, 0 test files
- **Observation**: The desktop package has no tests at all. Three modules contain testable logic that doesn't require Electron APIs:
  1. `sse.ts` — SSE stream parsing with buffer management, event matching via regex, and JSON parsing. The `connect()` function splits on `\n\n`, matches `event:` and `data:` lines, and parses JSON. This is pure stream processing logic.
  2. `window.ts` — State machine with 5 mutable module-level variables (`win`, `miniMode`, `visible`, `ghostEnabled`, `ghostOpacityValue`). The `applyVisualState()` function has a 3-branch conditional. A `_getTestState()` export exists, suggesting tests were planned but never written:
     ```typescript
     export function _getTestState() {
       return { visible, ghostEnabled, ghostOpacityValue, miniMode };
     }
     ```
  3. `config.ts` — HTTP fetch with JSON parsing and fallback to `DEFAULT_CONFIG` on error.

  The remaining files (`tray.ts`, `server.ts`, `install-cli.ts`, `main.ts`, `preload.ts`) are primarily Electron glue code where unit testing has low value.

- **Impact**: The SSE parser in `sse.ts` handles chunked data and could have buffer-splitting bugs. The window state machine in `window.ts` controls visibility, ghost mode, and mini mode — bugs here cause the app to become invisible or unresponsive. The `_getTestState` escape hatch in production code is a code smell that would be unnecessary if the module used a factory pattern.
- **Suggestion**: Extract the SSE parsing logic from `sse.ts` into a pure function `parseSSEChunk(buffer: string): { events: Array<{event, data}>, remainder: string }` and test it. For `window.ts`, the state logic could be tested if refactored to a factory, but the `_getTestState` export already enables testing the current design — write the tests it was designed for.
- **Severity**: Medium

---

- **Area**: `server/src/routes/events/events.test.ts` — weak assertions on webhook and SSE handlers
- **Observation**: Two tests assert only that a function was called, without verifying the arguments:
  ```typescript
  // events.test.ts line 39
  expect(vi.mocked(handleWebhookEvent)).toHaveBeenCalled();
  // events.test.ts line 104
  expect(vi.mocked(sseReply)).toHaveBeenCalled();
  ```
  The `handleWebhookEvent` call should verify the session ID and event name were passed correctly. The `sseReply` call should verify it received the Fastify reply object. Similarly in `SettingsPage.test.tsx`:
  ```typescript
  // SettingsPage.test.tsx line 63
  expect(mockUpdateConfig).toHaveBeenCalled();
  ```
  This test ("save button calls updateConfig") doesn't verify what config was saved. A later test in the same file does check `savedConfig.test_runners`, showing the pattern is inconsistent.
- **Impact**: These tests would pass even if the route sent wrong data to the webhook handler or the settings page saved garbage config. They verify wiring exists but not correctness.
- **Suggestion**: Replace `toHaveBeenCalled()` with `toHaveBeenCalledWith(...)` specifying the expected arguments. For `handleWebhookEvent`, assert the session ID and event name. For `mockUpdateConfig`, assert the config object shape.
- **Severity**: Medium

---

- **Area**: `client/src/pages/SessionDetailPage/SessionDetailPage.test.tsx` — tautological loading test
- **Observation**: The "shows loading state initially" test asserts:
  ```typescript
  it("shows loading state initially", () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}));
    renderComponent();
    expect(document.body).toBeInTheDocument();
  });
  ```
  `document.body` is always in the document. This test asserts nothing about the loading state — no spinner, no loading text, no absence of session data. It appears to have been weakened to pass rather than asserting on actual loading UI.
- **Impact**: If the loading state rendering breaks (e.g., shows an error instead of a spinner, or renders stale data), this test would still pass.
- **Suggestion**: Assert on the actual loading indicator the component renders, or at minimum assert that session data is NOT yet visible (`expect(screen.queryByText("test-session-id")).not.toBeInTheDocument()`).
- **Severity**: Low

---

- **Area**: `client/src/pages/SkillGraphPage/` — no page-level test
- **Observation**: The `useSkillGraph` hook has thorough tests (10 test cases covering loading, error, node formatting, edge mapping, collisions). But `SkillGraphPage.tsx` itself — which integrates ReactFlow, loading/error states, and three sub-components (`SkillNode`, `GraphControls`, `ZoomControls`) — has no test. The page has conditional rendering branches for loading and error states that are only tested indirectly through the hook.
- **Impact**: Low — the hook tests cover the data transformation logic. The page is a thin rendering layer. However, the ReactFlow integration and the conditional rendering branches are untested.
- **Suggestion**: A single smoke test rendering the page with mocked `useSkillGraph` return values (loading, error, success) would cover the conditional branches.
- **Severity**: Low

---

- **Area**: `client/src/components/` — `ExchangeCard` and `RenameModal` untested
- **Observation**: `ExchangeCard.tsx` has truncation logic (`truncate()` helper) and conditional rendering (expandable sections, tool badges, timestamps). `RenameModal.tsx` has state management (syncing value on open, conditional save when name changed, Enter key handling). Three other untested components (`NotificationBar`, `ActionDropdown`, `ComposeProviders`) are thin wrappers with minimal logic.
- **Impact**: `ExchangeCard` truncation edge cases (exact boundary, empty strings) and `RenameModal` save-when-unchanged logic could regress without detection.
- **Suggestion**: Test `ExchangeCard` truncation behavior and conditional badge rendering. Test `RenameModal` save logic (skips API call when name unchanged, handles Enter key).
- **Severity**: Low

---

- **Area**: `server/src/services/event-bus.test.ts` — listener cleanup relies on test discipline
- **Observation**: The event bus uses a module-level `const listeners = new Set<Listener>()`. Tests clean up by calling `unsub()` at the end of each test. The `beforeEach` only calls `vi.clearAllMocks()`, which does NOT clear the listeners Set. If any test fails before reaching its `unsub()` call, listeners leak into subsequent tests:

  ```typescript
  // event-bus.test.ts
  beforeEach(() => {
    vi.clearAllMocks(); // does NOT clear the listeners Set
  });

  it("fans out to all listeners", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribe(a);
    const unsubB = subscribe(b);
    // ... assertions ...
    unsubA(); // if test fails before here, listeners leak
    unsubB();
  });
  ```

- **Impact**: Test isolation is fragile. A failing test could cause cascading failures in subsequent tests due to leaked listeners receiving unexpected events.
- **Suggestion**: Move `unsub()` calls into `afterEach` or use a test-level cleanup array. Alternatively, expose a `_resetForTest()` function on the event bus (similar to `window.ts`'s `_getTestState` pattern, though a factory would be better).
- **Severity**: Low

---

- **Area**: `shared/sync/validation.ts` — `filterValid` and `parseValidationArray` have no direct tests
- **Observation**: These two functions are used by `project-config.ts` (which IS tested) and by the hook-handler's config parsing. They handle Zod schema validation with error logging. While they're exercised indirectly through `project-config.test.ts`, their specific behaviors (logging invalid items to stderr, returning undefined vs empty array for missing vs invalid keys) are not directly asserted.
- **Impact**: Low — the functions are simple and exercised indirectly. But the distinction between "key absent → undefined" and "key present but invalid → undefined with stderr log" is a subtle contract that could break without detection.
- **Suggestion**: Add a small test file for `validation.ts` covering the absent-key vs invalid-key distinction and the stderr logging behavior.
- **Severity**: Low

### Deepening Candidates

- **Cluster**: Server route handlers + service mocks (`server/src/routes/sessions/sessions.ts` ↔ `server/src/services/storage/`, `server/src/services/log-parser/`)
- **Why they're coupled**: Route handlers call services directly, passing through session IDs, parsing results, and status computations. The `helpers.ts` file in the routes directory already contains logic that bridges routes and services (`toSessionWithStatus`, `safeActiveSkills`). The shared mock file (`__tests__/mocks/services.ts`) is a maintenance artifact of the shallow boundary.
- **Dependency category**: In-process
- **Test impact**: Sociable route tests would replace the need for separate `helpers.test.ts` tests and reduce reliance on the shared mock file. The individual service unit tests would remain for testing service-internal logic.

---

- **Cluster**: `lifecycle.ts` interval management + `event-bus.ts` listener management
- **Why they're coupled**: Both use module-level mutable state (Sets, intervals) with the same pattern: start/stop lifecycle, callback registration, no factory isolation. `startPidPolling` calls `onSessionClosed` which in production triggers `broadcast()` on the event bus. They share the "module-level stateful service" anti-pattern.
- **Dependency category**: In-process
- **Test impact**: A factory-based "session lifecycle manager" that owns both PID polling and event broadcasting would allow isolated test instances. The existing `event-bus.test.ts` tests and the `lifecycle.test.ts` pure-function tests would be subsumed by tests of the combined manager.

---

- **Cluster**: `CherrypickPage` + `useCherrypick` hook + `group-exchanges` + `prune-conversation` utilities
- **Why they're coupled**: The page delegates entirely to the hook, which orchestrates the two utility modules. The hook's state machine (upload → edit → preview) is the glue between file parsing and conversation pruning. Testing the hook exercises the full feature pipeline.
- **Dependency category**: In-process
- **Test impact**: Hook-level tests for `useCherrypick` would serve as boundary tests for the entire cherrypick feature, making separate page-level rendering tests lower priority. The existing utility tests (`group-exchanges.test.ts`, `prune-conversation.test.ts`) would remain as focused unit tests for edge cases.

### Metrics

- Files examined: 52
- Findings: 10 (2 high, 3 medium, 5 low)
- Deepening candidates: 3
