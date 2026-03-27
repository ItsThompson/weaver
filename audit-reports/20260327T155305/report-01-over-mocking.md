# Audit Report: Over-Mocking in Tests

## Summary

The server route tests are built on a centralized mock file (`server/src/__tests__/mocks/services.ts`) that blanket-mocks 8 internal modules — including pure functions that have no I/O dependencies. This creates a testing architecture where route handlers are verified almost entirely through mock call assertions (`toHaveBeenCalledWith`) rather than observable output, meaning the tests prove the code calls the right functions with the right arguments but cannot catch regressions in the actual logic those functions perform. The hook-handler validation tests follow the same pattern, mocking internal pure-logic modules that could run as real implementations. The client-side mocking is the healthiest: it mocks the `api` module (a true network boundary) and asserts on rendered UI output.

## Findings

### Finding 1: Centralized `services.ts` mock blanket-mocks pure functions alongside I/O modules

- **Area**: `server/src/__tests__/mocks/services.ts`, consumed by all 6 route test files
- **Observation**: This single file mocks 8 modules at once. Among them, the log-parser barrel (`../../services/log-parser/index`) is mocked with stubs for `groupEventsByTurn`, `matchToolCalls`, `deriveActivity`, and `extractActiveSkillPaths`. These are all pure functions — they take data in and return data out with zero I/O. The only function in that barrel that touches the filesystem is `parseLogFile`. Yet the mock replaces all of them:

  ```ts
  // server/src/__tests__/mocks/services.ts
  vi.mock("../../services/log-parser/index", () => ({
    parseLogFile: vi.fn(),
    groupEventsByTurn: vi.fn(),
    matchToolCalls: vi.fn().mockReturnValue([]),
    getLastEvent: vi
      .fn()
      .mockResolvedValue({ name: "stop", timestamp: new Date().toISOString() }),
    deriveActivity: vi.fn().mockReturnValue("idle"),
    extractActiveSkillPaths: vi.fn().mockReturnValue([]),
  }));
  ```

  The real implementations are trivially exercisable in-process:
  - `groupEventsByTurn` (`server/src/services/log-parser/group-turns.ts`): a 60-line pure function that partitions events into turns
  - `matchToolCalls` (`server/src/services/log-parser/tool-calls.ts`): a 35-line pure function that pairs pre/post tool events
  - `deriveActivity` (`server/src/services/log-parser/activity.ts`): a pure switch statement
  - `extractActiveSkillPaths` (`server/src/services/log-parser/activity.ts`): a pure filter/map over events

- **Impact**: Route tests like `sessions.test.ts` set up mock return values for `groupEventsByTurn` and `extractActiveSkillPaths`, then assert the route handler passes them through. If the real `groupEventsByTurn` changes its output shape or the real `extractActiveSkillPaths` changes its filtering logic, no route test will catch it. The pure logic has its own unit tests, but the integration between "route handler calls pure function with parsed events" is never exercised.
- **Suggestion**: Split the log-parser mock so only `parseLogFile` (the I/O boundary) is mocked. Let `groupEventsByTurn`, `matchToolCalls`, `deriveActivity`, and `extractActiveSkillPaths` run as real implementations. Route tests would then feed fixture events through `parseLogFile.mockResolvedValue(fixtureEvents)` and verify the route response contains correctly grouped turns, matched tool calls, etc.
- **Severity**: High

---

### Finding 2: Route tests assert primarily on mock call signatures, not observable output

- **Area**: `server/src/routes/sessions/sessions.test.ts`, `delete.test.ts`, `events/events.test.ts`, `orphans/orphans.test.ts`, `skills/skills.test.ts`, `config.test.ts`
- **Observation**: Across the 6 route test files, there are 28 `toHaveBeenCalledWith` / `toHaveBeenCalled` / `toHaveBeenCalledTimes` assertions on mocked internal modules. Many tests have these as their primary or only meaningful assertion beyond status code checks. Examples:

  `delete.test.ts` — the "removes session, log file, and marker file" test has 4 mock-call assertions and 1 status code check:

  ```ts
  expect(vi.mocked(unlink)).toHaveBeenCalledWith(
    expect.stringContaining("aaa.jsonl"),
  );
  expect(vi.mocked(unlink)).toHaveBeenCalledWith(
    expect.stringContaining(".current-session-100"),
  );
  expect(vi.mocked(writeSessions)).toHaveBeenCalledWith([]);
  expect(vi.mocked(broadcast)).toHaveBeenCalledWith("aaa");
  ```

  `skills.test.ts` — "passes config skill_paths to buildSkillGraph" has only a mock-call assertion:

  ```ts
  expect(buildSkillGraph).toHaveBeenCalledWith(
    ["/projects/my-app/.kiro/skills"],
    { core: { skills: ["skill-a"] } },
  );
  ```

  `events.test.ts` — "delegates to sseReply" asserts only that the mock was called:

  ```ts
  expect(vi.mocked(sseReply)).toHaveBeenCalled();
  ```

  `config.test.ts` — 9 mock-call assertions across its tests, including verifying `writeConfig`, `emit`, and `skillCache.clear` were called with specific arguments.

- **Impact**: These tests are tightly coupled to the implementation's internal call graph. Refactoring a route handler to call services differently (e.g., combining two service calls into one, or reordering operations) would break tests even if the external behavior is identical. The tests verify "how" rather than "what."
- **Suggestion**: For route tests, assert on the HTTP response body and status code as the primary verification. For side effects that matter (like SSE broadcasts), use a lightweight in-process subscriber on the real event bus rather than mocking `broadcast`/`emit`. For persistence, mock only the filesystem layer and verify the data written, not the function called.
- **Severity**: High

---

### Finding 3: `config.test.ts` mocks `parseAndValidateConfig` — a pure validation function

- **Area**: `server/src/routes/config.test.ts`, `server/src/services/config/config.ts`
- **Observation**: The config route test mocks the entire `config/index` module:

  ```ts
  vi.mock("../services/config/index", () => ({
    readConfig: vi.fn(),
    parseAndValidateConfig: vi.fn(),
    writeConfig: vi.fn(),
  }));
  ```

  `readConfig` reads from the filesystem — legitimate mock target. `writeConfig` writes to the filesystem — legitimate. But `parseAndValidateConfig` is a pure function that parses JSON and runs field validators:

  ```ts
  // server/src/services/config/config.ts
  export function parseAndValidateConfig(raw: string): { config: WeaverConfig; warnings: string[] } {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { ... }
    // ... runs FIELD_VALIDATORS ...
    return { config, warnings };
  }
  ```

  By mocking it, the PUT/PATCH config route tests control what validation returns. The test for "does not emit SSE on validation failure" sets:

  ```ts
  vi.mocked(parseAndValidateConfig).mockReturnValue({
    config: DEFAULT_CONFIG,
    warnings: ["bad field"],
  });
  ```

  This means the test never verifies that real invalid input actually produces warnings. If the validator logic changes (e.g., a field name is renamed), the route test won't catch it.

- **Impact**: The route handler's validation behavior is tested against a mock, not the real validator. Bugs in the validator-to-route integration (e.g., the route checking `warnings.length` but the validator returning a different structure) would go undetected.
- **Suggestion**: Mock only `readConfig` and `writeConfig` (I/O). Let `parseAndValidateConfig` run as the real implementation. Feed actual config payloads through the route and verify the response reflects real validation outcomes.
- **Severity**: High

---

### Finding 4: Webhook test reimplements `deriveActivity` as a mock

- **Area**: `server/src/services/webhook/__tests__/webhook-helpers.ts`
- **Observation**: The webhook test helper mocks `deriveActivity` with a manual reimplementation:

  ```ts
  vi.mocked(deriveActivity).mockImplementation((name: string) => {
    if (name === "agentSpawn") return "starting";
    if (name === "stop") return "idle";
    if (name === "preToolUse") return "running_tool";
    return "processing";
  });
  ```

  The real `deriveActivity` in `server/src/services/log-parser/activity.ts` is a pure switch statement that does exactly this (plus a `pending_approval` check for old `preToolUse` events). The mock is a partial reimplementation that omits the `pending_approval` path, meaning the webhook tests can't verify the real pending_approval behavior without explicitly overriding the mock again.

- **Impact**: Maintenance burden — two copies of the same logic that can drift. The mock omits the `pending_approval` threshold check, so any bug in that path won't surface in webhook tests. The `pending_approval` test in `webhook-simple.test.ts` works around this by testing `buildSimpleWebhookPayload` directly with a hardcoded activity string, bypassing the real derivation entirely.
- **Suggestion**: Remove the `deriveActivity` mock. The real function is pure and fast. Let it run.
- **Severity**: Medium

---

### Finding 5: `keep-awake.test.ts` mocks `deriveActivity` and `getLastEvent` when only `getLastEvent` needs mocking

- **Area**: `server/src/services/keep-awake.test.ts`
- **Observation**: The test mocks both `getLastEvent` (which calls `parseLogFile` → filesystem) and `deriveActivity` (pure switch statement):

  ```ts
  vi.mock("./log-parser/index", () => ({
    getLastEvent: mockGetLastEvent,
    deriveActivity: mockDeriveActivity,
  }));
  ```

  Then in the "runs the keep-awake script" test:

  ```ts
  mockGetLastEvent.mockResolvedValue({
    name: "preToolUse",
    timestamp: new Date().toISOString(),
  });
  mockDeriveActivity.mockReturnValue("running_tool");
  ```

  The real `deriveActivity("preToolUse", recentTimestamp)` would return `"running_tool"` — the mock adds no value here. It just duplicates the expected behavior.

- **Impact**: If `deriveActivity` is changed to return a different status for `preToolUse`, the keep-awake test would still pass with its hardcoded mock, hiding a real behavioral change.
- **Suggestion**: Mock only `getLastEvent`. Use the real `deriveActivity`.
- **Severity**: Medium

---

### Finding 6: `orphan-storage/read.test.ts` mocks `groupEventsByTurn` unnecessarily

- **Area**: `server/src/services/orphan-storage/read.test.ts`
- **Observation**: The test mocks the log-parser module:

  ```ts
  vi.mock("../log-parser/index", () => ({
    groupEventsByTurn: vi.fn().mockReturnValue([]),
  }));
  ```

  The `groupByPid` function in `read.ts` calls `groupEventsByTurn` to build turn groups for each PID's events. `groupEventsByTurn` is a pure function. The test then asserts on `eventCount` and group structure, but with the mock always returning `[]` for turns, it never verifies that the real turn grouping works correctly in the orphan context.

- **Impact**: The `groupByPid` test verifies event counting and PID grouping but not turn grouping — the mock hides whether `groupEventsByTurn` produces correct turns for orphan events. If orphan events have a different structure that causes `groupEventsByTurn` to fail, this test won't catch it.
- **Suggestion**: Remove the `groupEventsByTurn` mock. Feed real orphan events and verify the turns are grouped correctly.
- **Severity**: Medium

---

### Finding 7: hook-handler `mock-validate-deps.ts` mocks `resolveTestDirs` (scope) — a pure function

- **Area**: `hook-handler/src/validate/__test-helpers__/mock-validate-deps.ts`, consumed by `stop-hook.test.ts`, `run-validation.test.ts`, `stop-trigger.test.ts`, `post-tool-use-trigger.test.ts`
- **Observation**: The mock file stubs 4 modules:

  ```ts
  vi.mock("../../config/index", () => ({
    readProjectConfig: vi.fn(),
    resolveTestRunners: vi.fn(),
    findNearestConfig: vi.fn(),
    groupFilesByConfig: vi.fn(),
  }));
  vi.mock("../../changed-files/index", () => ({
    extractChangedFiles: vi.fn(),
  }));
  vi.mock("../../agent-tests/index", () => ({
    extractAgentTestedDirs: vi.fn(),
  }));
  vi.mock("../../scope/index", () => ({ resolveTestDirs: vi.fn() }));
  ```

  `extractChangedFiles` and `extractAgentTestedDirs` call `getCurrentTurnEvents` which reads JSONL from the filesystem — legitimate mock targets. `findNearestConfig` and `groupFilesByConfig` call `readProjectConfig` which reads `.weaver.json` — the I/O is one level deeper.

  But `resolveTestDirs` (`hook-handler/src/scope/scope.ts`) is a pure function that takes changed files, a scope strategy, a cwd, and agent-tested dirs, then returns directory paths. It uses `realpathSync` (I/O), but in tests the inputs could be controlled to avoid that. The `stop-hook.test.ts` mocks it and then asserts on the mock call:

  ```ts
  vi.mocked(resolveTestDirs).mockReturnValue(["src"]);
  // ...
  expect(resolveTestDirs).toHaveBeenCalledWith(
    ["/project/src/a.ts"],
    "parent",
    "/project",
    [],
  );
  ```

  This is a pure function being mocked and then verified by call signature.

- **Impact**: The stop-hook test can't verify that the real scope resolution logic produces correct directories. If `resolveTestDirs` has a bug in its `collapseSubdirs` or `applyScope` logic, the stop-hook test won't catch it.
- **Suggestion**: `resolveTestDirs` uses `realpathSync` internally, which is the only I/O. Either mock `realpathSync` at the `node:fs` level (already done via `mock-fs.ts`) and use the real `resolveTestDirs`, or inject the realpath function as a dependency.
- **Severity**: Medium

---

### Finding 8: Hardcoded happy-path defaults in centralized mocks mask missing test setup

- **Area**: `server/src/__tests__/mocks/services.ts`
- **Observation**: The centralized mock pre-configures return values:

  ```ts
  matchToolCalls: vi.fn().mockReturnValue([]),
  getLastEvent: vi.fn().mockResolvedValue({ name: "stop", timestamp: new Date().toISOString() }),
  deriveActivity: vi.fn().mockReturnValue("idle"),
  extractActiveSkillPaths: vi.fn().mockReturnValue([]),
  readOrphanEvents: vi.fn().mockResolvedValue([]),
  groupByPid: vi.fn().mockReturnValue([]),
  resolveConfiguredSkills: vi.fn().mockResolvedValue([]),
  isWebhookEnabled: vi.fn().mockReturnValue(false),
  ```

  Any test that imports `services.ts` gets these defaults silently. If a test forgets to set up `extractActiveSkillPaths` for a scenario that should have active skills, it will pass with an empty array — the test author may not realize the mock is hiding a code path.

- **Impact**: Silent false passes. A test that should verify "route returns active skills" could accidentally pass with `[]` if the mock override is forgotten. The defaults create an invisible safety net that reduces test confidence.
- **Suggestion**: Remove default return values from the centralized mock. Use bare `vi.fn()` stubs. This forces each test to explicitly set up the return values it needs, making test intent clearer and preventing silent passes.
- **Severity**: Medium

---

### Finding 9: `cli/src/commands.test.ts` mocks `./utils` (HTTP layer) — appropriate but tightly coupled to curl implementation

- **Area**: `cli/src/commands.test.ts`, `cli/src/utils.ts`
- **Observation**: The CLI test mocks `post`, `get`, and `patch` from `./utils`. These functions shell out to `curl` via `execSync` — a true external dependency. The mock is appropriate. However, every test asserts on the mock call:

  ```ts
  expect(vi.mocked(post)).toHaveBeenCalledWith("/api/view", { pid: 12345 });
  expect(logSpy).toHaveBeenCalledWith(expected);
  ```

  The `logSpy` assertion on `console.log` output is actually a good observable-behavior assertion. The `post` call assertion is implementation-coupled but acceptable here since the CLI's job is literally to make HTTP calls.

- **Impact**: Low. The mock target is appropriate (network I/O via curl). The call assertions are reasonable for a thin CLI layer whose purpose is to translate commands into API calls.
- **Suggestion**: No change needed. This is an acceptable use of mocking.
- **Severity**: Low

---

### Finding 10: Client `queries.ts` mock hardcodes fixture data for React Query hooks

- **Area**: `client/src/__tests__/mocks/queries.ts`
- **Observation**: The mock returns hardcoded skill graph data:

  ```ts
  vi.mock("../../hooks/queries", () => ({
    useSkillGraphQuery: vi.fn().mockReturnValue({
      data: {
        nodes: [
          { name: "coding-practices" },
          { name: "typescript-standards" },
          { name: "backend-coding-practices" },
        ],
        edges: [],
      },
    }),
    useConfigQuery: vi.fn().mockReturnValue({ data: undefined }),
    useSkillDetailQuery: vi.fn().mockReturnValue({ data: undefined }),
  }));
  ```

  This mock is imported by component tests that need to render without real API calls. The hardcoded data shape could drift from the real API response shape. However, the client also has `api.ts` mocks that are used by hook tests (like `useSkillGraph.test.ts`) which test the data transformation layer with controlled API responses — a better pattern.

- **Impact**: Low. The `queries.ts` mock is used by component tests that focus on rendering behavior, not data transformation. The data shape risk is mitigated by the hook-level tests that use the `api.ts` mock.
- **Suggestion**: Consider removing the `queries.ts` mock and having component tests use the `api.ts` mock with an SWR provider instead, which would exercise the real query hooks.
- **Severity**: Low

## Deepening Candidates

### Candidate 1: Log-parser pure functions into route handler integration

- **Cluster**: `server/src/services/log-parser/` (`groupEventsByTurn`, `matchToolCalls`, `deriveActivity`, `extractActiveSkillPaths`) + route handlers (`sessions.ts`, `events.ts`) + `server/src/services/webhook/handler.ts`
- **Why they're coupled**: Route handlers call `parseLogFile` then immediately pass results to `groupEventsByTurn`, `matchToolCalls`, etc. The mock boundary is drawn at the barrel export, but the real boundary is at `parseLogFile`'s filesystem read. Every consumer of the log-parser barrel needs the same mock setup.
- **Dependency category**: In-process. The pure functions have zero external dependencies. Only `parseLogFile` touches the filesystem.
- **Test impact**: Route tests would no longer need to mock `groupEventsByTurn`, `matchToolCalls`, `deriveActivity`, or `extractActiveSkillPaths`. They'd mock only `parseLogFile` and feed fixture events. The existing unit tests for the pure functions (`group-turns.test.ts`, `tool-calls.test.ts`, `activity.test.ts`) would remain as focused unit tests. Route tests would gain integration coverage of the parse→group→match pipeline.

### Candidate 2: Config read + validate pipeline

- **Cluster**: `server/src/services/config/config.ts` (`readConfig`, `parseAndValidateConfig`, `writeConfig`) + `server/src/services/config/validators/` + `server/src/routes/config.ts`
- **Why they're coupled**: The route handler calls `readConfig` (I/O), then `parseAndValidateConfig` (pure), then `writeConfig` (I/O). The route test mocks all three. But `parseAndValidateConfig` is the core logic — it's where validation warnings are generated. Mocking it means the route test can't verify that real invalid input produces the right HTTP 422 response.
- **Dependency category**: Local-substitutable. `readConfig` and `writeConfig` touch `~/.weaver/config.json`. `parseAndValidateConfig` is pure.
- **Test impact**: The route test would mock only `readConfig` and `writeConfig`. `parseAndValidateConfig` and all field validators would run as real code. The existing `factory.test.ts` and `field.test.ts` validator unit tests would remain. The route test would gain end-to-end validation coverage: "send bad config → get 422 with correct warning message."

### Candidate 3: Validation trigger pipeline (hook-handler)

- **Cluster**: `hook-handler/src/validate/run-validation/stop-trigger.ts` + `../../changed-files/` + `../../config/` + `../../scope/` + `../../agent-tests/` + `../stop-hook/`
- **Why they're coupled**: `runStopTrigger` orchestrates: extract changed files → group by config → resolve test runners → extract agent-tested dirs → resolve test dirs → run stop hooks. The test mocks 4 of these 5 steps. The I/O boundaries are: `getCurrentTurnEvents` (reads JSONL), `readProjectConfig` (reads `.weaver.json`), and `spawnSync` (runs commands).
- **Dependency category**: In-process for `resolveTestDirs` and `groupFilesByConfig`. Local-substitutable for `extractChangedFiles` and `extractAgentTestedDirs` (they read local JSONL files).
- **Test impact**: If the I/O was mocked at the lowest level (`node:fs` for JSONL reading, `node:child_process` for command execution), the entire pipeline from `runStopTrigger` down to `runStopHook` could be tested as a single integration. The 4 separate mock setups in `mock-validate-deps.ts` would be replaced by filesystem fixtures and `spawnSync` mocks.

## Metrics

- Files examined: 64
- Findings: 10 (3 high, 5 medium, 2 low)
- Deepening candidates: 3
