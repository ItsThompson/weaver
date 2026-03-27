# Anti-Patterns and Code Smells — Audit Report

### Summary

The codebase has a pervasive pattern of hardcoded `homedir()` calls scattered across 12+ production files, creating an untestable dependency on the filesystem layout. The webhook handler is a god file with 5+ responsibilities and module-level mutable state. Event names flow through the system as bare strings despite being a closed set of 6 values, creating a correctness risk that the type system could prevent for free.

### Findings

---

- **Area**: `shared/types/events.ts`, and 47+ consumer files across `server/`, `hook-handler/`, `client/`
- **Observation**: `hook_event_name` is typed as `string` in `HookEventData`:
  ```ts
  // shared/types/events.ts
  export interface HookEventData {
    hook_event_name: string;
    // ...
  }
  ```
  The actual values are a closed set: `"agentSpawn"`, `"stop"`, `"preToolUse"`, `"postToolUse"`, `"userPromptSubmit"`, `"validation"`. These string literals appear 304 times across 47 files in switch statements, equality checks, and test assertions. For example in `server/src/services/log-parser/activity.ts`:
  ```ts
  export function deriveActivity(eventName: string, ...): ActivityStatus {
    switch (eventName) {
      case "agentSpawn": return "starting";
      case "stop": return "idle";
      case "preToolUse": { ... }
      default: return "processing";
    }
  }
  ```
  And in `server/src/services/webhook/handler.ts`:
  ```ts
  if (eventName === "postToolUse" || eventName === "stop") {
    clearPendingTimer(sessionId);
  } else if (eventName === "preToolUse") {
  ```
  A typo in any of these 304 occurrences would silently fall through to a default case. The compiler cannot help.
- **Impact**: A misspelled event name compiles fine but produces wrong behavior at runtime. Every new event name requires a manual grep to find all switch/if sites. The `default` branch in `deriveActivity` silently absorbs unknown events as `"processing"` — a bug would look like normal operation.
- **Suggestion**: Define `type HookEventName = "agentSpawn" | "stop" | "preToolUse" | "postToolUse" | "userPromptSubmit" | "validation"` in `shared/types/events.ts` and use it for `hook_event_name`, `eventName` parameters in `deriveActivity`, `extractContext`, `handleWebhookEvent`, `buildPayloadForFormat`, and `broadcast`. The compiler will then flag typos and incomplete switch statements.
- **Severity**: High

---

- **Area**: `server/src/routes/events/events.ts` → `server/src/services/webhook/handler.ts` → `server/src/services/webhook/dispatch.ts`
- **Observation**: There is a chain of unawaited async calls. In `events.ts` line 24:
  ```ts
  // server/src/routes/events/events.ts
  broadcast(sessionId, eventName, sessionName);
  handleWebhookEvent(sessionId, eventName, sessionName, session);
  return { ok: true };
  ```
  `handleWebhookEvent` is `async` but is called without `await`. Inside `handler.ts` line 73, the same pattern repeats:
  ```ts
  // server/src/services/webhook/handler.ts
  dispatchWebhook(config.webhook_url, payload);
  ```
  `dispatchWebhook` is `async` but called without `await`. Any rejection from `dispatchWebhook` becomes an unhandled promise rejection. The `setTimeout` callback inside `handleWebhookEvent` (lines 78–99) does `await readConfig()` and `await parseLogFile()` inside a timer — if these throw, the `catch` block logs but the outer `handleWebhookEvent` promise has already resolved.
- **Impact**: Unhandled promise rejections can crash the Node.js process (depending on `--unhandled-rejections` mode). The route handler returns `{ ok: true }` before the webhook is sent, so the caller has no way to know if the webhook failed. In tests, `handleWebhookEvent` is properly awaited (`await webhook.handleWebhookEvent(...)`) which masks this production bug.
- **Suggestion**: Either `await handleWebhookEvent(...)` in the route handler (if webhook delivery should block the response), or explicitly handle the returned promise with `.catch()` and document the fire-and-forget intent. Same for `dispatchWebhook` inside `handleWebhookEvent`.
- **Severity**: High

---

- **Area**: `server/src/services/webhook/handler.ts`
- **Observation**: This 113-line file has at least 5 distinct responsibilities:
  1. **Session tracking**: `enabledSessions` Set, `isWebhookEnabled()`, `setWebhookEnabled()`
  2. **Config reading**: calls `readConfig()` to get webhook URL and format
  3. **Log parsing**: calls `parseLogFile()` and `deriveActivity()`
  4. **Payload construction**: delegates to `buildPayloadForFormat()` which selects between simple/advanced
  5. **Timer management**: `pendingTimers` Map, `clearPendingTimer()`, `stopWebhookTimers()`, the `setTimeout` logic for pending approval detection

  The `handleWebhookEvent` function (lines 53–104) orchestrates all five concerns in a single function body, including a nested `setTimeout` callback that re-reads config and re-parses logs.

- **Impact**: Any change to timer logic, payload format selection, or session tracking requires modifying this file. The timer management is tightly coupled to the webhook dispatch — you cannot test "does the pending timer fire correctly?" without also mocking config reading and log parsing. The module-level `pendingTimers` and `enabledSessions` make it impossible to run parallel tests or reset state cleanly without calling `stopWebhookTimers()`.
- **Suggestion**: Extract session tracking (`enabledSessions`) into its own module. Extract timer management into a `PendingApprovalTracker` that accepts a callback for "what to do when the timer fires." The handler becomes a thin orchestrator that wires these together.
- **Severity**: High

---

- **Area**: 12+ production files across `server/src/` and `hook-handler/src/`
- **Observation**: `homedir()` from `node:os` is called directly to construct file paths in at least these production files:
  - `server/src/services/config/config.ts`: `const CONFIG_PATH = () => join(homedir(), ".weaver", "config.json")`
  - `server/src/services/storage/sessions.ts`: `const DATA_DIR = () => join(homedir(), ".weaver")`
  - `server/src/services/storage/lifecycle.ts`: `const DATA_DIR = () => join(homedir(), ".weaver")`
  - `server/src/services/log-parser/parse.ts`: `const LOGS_DIR = () => join(homedir(), ".weaver", "logs")`
  - `server/src/services/orphan-storage/paths.ts`: `export const ORPHAN_PATH = () => join(homedir(), ".weaver", "logs", "orphan.jsonl")`
  - `server/src/services/skill-graph/discover.ts`: `const GLOBAL_SKILLS_PATH = () => resolve(join(homedir(), ".kiro", "skills"))`
  - `server/src/services/skill-graph/get-skill-detail.ts`: `const GLOBAL_SKILLS_PATH = () => resolve(join(homedir(), ".kiro", "skills"))`
  - `server/src/services/config/validators/validate-paths.ts`: `const GLOBAL_SKILLS_PATH = () => resolve(join(homedir(), ".kiro", "skills"))`
  - `server/src/routes/sessions/delete.ts`: `const dataDir = join(homedir(), ".weaver")`
  - `hook-handler/src/validate/run-validation/run-validation.ts`: `join(homedir(), ".weaver", "logs", ...)`
  - `hook-handler/src/validate/exit/exit.ts`: `join(homedir(), ".weaver", "logs", ...)`
  - `hook-handler/src/inject/run-inject/run-inject.ts`: `join(homedir(), ".weaver", "logs", ...)`
  - `hook-handler/src/config/test-runners/test-runners.ts`: `join(homedir(), ".weaver", "config.json")`

  Each file independently constructs the same base paths. The pattern `() => join(homedir(), ".weaver")` appears as a module-level thunk in 3 separate files.

- **Impact**: Testing any of these modules requires either mocking `node:os` (which the test files do via `vi.mock`) or accepting that tests hit the real filesystem. The duplicated path construction means a change to the data directory layout requires updating 12+ files. The thunk pattern `const DATA_DIR = () => ...` was adopted to avoid import-time evaluation, but it's repeated independently in each file rather than centralized.
- **Suggestion**: Create a single `paths.ts` module (e.g., `server/src/services/paths.ts`) that exports all path constructors: `weaverDir()`, `logsDir()`, `configPath()`, `sessionsFile()`, `orphanPath()`, `globalSkillsPath()`. All other modules import from this single source. For the hook-handler, accept the base directory as a parameter rather than computing it internally.
- **Severity**: Medium

---

- **Area**: `server/src/services/webhook/handler.ts`, `server/src/services/storage/lifecycle.ts`, `server/src/services/keep-awake.ts`, `server/src/services/event-bus.ts`, `desktop/src/window.ts`
- **Observation**: Multiple modules maintain mutable state at module scope:
  - `handler.ts`: `const pendingTimers = new Map<string, NodeJS.Timeout>()` and `const enabledSessions = new Set<string>()`
  - `lifecycle.ts`: `let cleanupInterval`, `let pidPollInterval`, `const openPids = new Set<number>()`
  - `keep-awake.ts`: `let interval: ReturnType<typeof setInterval> | null = null`
  - `event-bus.ts`: `const listeners = new Set<Listener>()`
  - `window.ts`: `let win`, `let miniMode`, `let visible`, `let ghostEnabled`, `let ghostOpacityValue`

  These are all singletons by virtue of module caching. The state is manipulated by exported functions and cannot be reset without calling specific cleanup functions (e.g., `stopWebhookTimers()`, `stopStaleSessionCleanup()`).

- **Impact**: Tests must carefully call cleanup functions between test cases or risk state leaking. Parallel test execution is impossible for any module that touches this state. The webhook test helpers demonstrate this: `afterEach(() => { webhook.stopWebhookTimers(); })` is required in every test file. If a new module-level state variable is added, every test file that imports the module must be updated.
- **Suggestion**: For server-side modules, encapsulate state in a class or factory function that returns an instance. For example, `createWebhookHandler({ readConfig, parseLogFile, dispatch })` returns an object with `handleEvent`, `isEnabled`, `setEnabled`, `stop` methods. The server entry point creates one instance; tests create fresh instances per test.
- **Severity**: Medium

---

- **Area**: `server/src/__tests__/mocks/services.ts`, consumed by `server/src/routes/sessions/sessions.test.ts`, `server/src/routes/events/events.test.ts`, `server/src/routes/sessions/delete.test.ts`, `server/src/routes/config.test.ts`
- **Observation**: A single mock file mocks 8 modules simultaneously:
  ```ts
  vi.mock("../../services/storage/index", () => ({ ... }));
  vi.mock("../../services/log-parser/index", () => ({ ... }));
  vi.mock("../../services/orphan-storage/index", () => ({ ... }));
  vi.mock("../../services/skill-resolver/index", () => ({ ... }));
  vi.mock("../../services/event-bus", () => ({ ... }));
  vi.mock("../../services/webhook/index", () => ({ ... }));
  vi.mock("../../services/skill-graph/index", () => ({ ... }));
  vi.mock("../../utils/logger", () => ({ ... }));
  ```
  Route test files import this as a side-effect: `import "../../__tests__/mocks/services"`. Every route test gets all 8 mocks regardless of which services it actually uses.
- **Impact**: This is a symptom of the route handlers directly importing 4–6 service modules each. The mock file couples all route tests to the same set of service interfaces — adding a new export to any mocked module requires updating this file, which breaks all route tests until fixed. A route test for `/api/config` doesn't need `orphan-storage` mocks, but gets them anyway.
- **Suggestion**: The root cause is that route handlers reach directly into service modules. If route handlers accepted their dependencies (e.g., via a context object or Fastify decorators), each test could provide only the dependencies it needs. Short-term, split the mega mock into per-service mock files.
- **Severity**: Medium

---

- **Area**: `server/src/services/webhook/dispatch.ts`
- **Observation**: `dispatchWebhook` catches all errors and logs them, returning nothing:
  ```ts
  export async function dispatchWebhook(
    url: string,
    payload: WebhookPayload | SimpleWebhookPayload,
  ): Promise<void> {
    try {
      await fetch(url, { ... });
    } catch (err) {
      log({ timestamp: new Date().toISOString(), event: "webhook_error", error: String(err) });
    }
  }
  ```
  The function doesn't check the HTTP status code. A 500 response from the webhook endpoint is treated as success. The caller (`handleWebhookEvent`) has no way to know if the webhook was delivered, failed, or returned an error status.
- **Impact**: Webhook delivery failures are invisible to the system. There's no retry logic, no error propagation, and no way for the UI to show "webhook failed." The `fetch` response is discarded entirely — not even the status code is logged.
- **Suggestion**: Return a result object `{ ok: boolean; status?: number; error?: string }` so callers can decide how to handle failures. Log the HTTP status code on non-2xx responses. Consider adding the response status to the existing log entry.
- **Severity**: Medium

---

- **Area**: `hook-handler/src/validate/logging/logging.ts`
- **Observation**: `writeValidationEvent` performs two unrelated side effects in one function:

  ```ts
  export function writeValidationEvent(...): void {
    // Side effect 1: synchronous file append
    mkdirSync(dirname(sessionLogPath), { recursive: true });
    appendFileSync(sessionLogPath, JSON.stringify(logEntry) + "\n");

    // Side effect 2: fire-and-forget HTTP POST
    fetch("http://localhost:8143/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, eventName: "validation" }),
      signal: AbortSignal.timeout(1000),
    }).catch(() => {});
  }
  ```

  The function writes to the filesystem AND notifies the server. The server URL `http://localhost:8143` is hardcoded. The `fetch` error is silently swallowed with `.catch(() => {})`.

- **Impact**: You cannot test "did the validation event get written correctly?" without also triggering an HTTP call (or mocking `fetch`). The hardcoded URL means this code breaks if the server port changes. The two side effects have different failure modes (sync file I/O vs async HTTP) but are bundled together.
- **Suggestion**: Split into two functions: `writeValidationEvent` (file I/O only, returns the written event) and `notifyServer` (HTTP call). Let the caller compose them. Accept the server URL as a parameter or read it from config.
- **Severity**: Medium

---

- **Area**: `server/src/services/storage/sessions.ts`, `server/src/services/storage/lifecycle.ts`, `server/src/services/orphan-storage/paths.ts`, `server/src/services/log-parser/parse.ts`
- **Observation**: The path `join(homedir(), ".weaver")` is independently constructed in at least 4 files:
  - `sessions.ts`: `const DATA_DIR = () => join(homedir(), ".weaver")`
  - `lifecycle.ts`: `const DATA_DIR = () => join(homedir(), ".weaver")`
  - `paths.ts`: `export const ORPHAN_PATH = () => join(homedir(), ".weaver", "logs", "orphan.jsonl")`
  - `parse.ts`: `const LOGS_DIR = () => join(homedir(), ".weaver", "logs")`

  Similarly, `GLOBAL_SKILLS_PATH = () => resolve(join(homedir(), ".kiro", "skills"))` is defined independently in both `discover.ts` and `get-skill-detail.ts`.

- **Impact**: If the data directory name changes from `.weaver` to something else, 4+ files need updating. The duplication is a maintenance hazard and makes it easy to introduce inconsistencies (e.g., one file using `.weaver` and another using `.weaver-data`).
- **Suggestion**: Centralize all path definitions in a single module. The `orphan-storage/paths.ts` file already exists as a partial solution but only covers orphan paths.
- **Severity**: Low

---

- **Area**: `desktop/src/window.ts`
- **Observation**: Five mutable variables at module scope control all window behavior:
  ```ts
  let win: BrowserWindow | null = null;
  let miniMode = false;
  let visible = false;
  let ghostEnabled = false;
  let ghostOpacityValue = 1;
  ```
  All exported functions (`createWindow`, `toggleWindow`, `showWindow`, `setGhostMode`, `isMiniMode`, `isWindowVisible`) read and mutate this shared state. A `_getTestState()` function was added specifically to expose internal state for testing:
  ```ts
  export function _getTestState() {
    return { visible, ghostEnabled, ghostOpacityValue, miniMode };
  }
  ```
- **Impact**: The `_getTestState` escape hatch is a code smell — it exists because the module's interface doesn't expose enough information for tests to assert on. The module cannot be instantiated twice (e.g., for testing different configurations). All functions are coupled through shared mutable variables rather than explicit data flow.
- **Suggestion**: Wrap the state and functions in a `createWindowManager(config)` factory. The factory returns an object with all the current exported functions plus a `getState()` method. The `_getTestState` hack becomes unnecessary.
- **Severity**: Low

---

- **Area**: `desktop/src/main.ts`
- **Observation**: The `app.on("ready")` handler passes 6 inline closures to `createTray`:
  ```ts
  createTray(
    toggleWindow,
    isWindowVisible,
    () => {
      currentConfig.ghost_mode = !currentConfig.ghost_mode;
      setGhostMode(currentConfig.ghost_mode, currentConfig.ghost_opacity);
      putConfig(server.SERVER_URL, currentConfig);
      return currentConfig.ghost_mode;
    },
    () => currentConfig.ghost_mode,
    () => {
      if (isMiniMode()) {
        navigateToMain(server.SERVER_URL);
      } else {
        navigateToMini(server.SERVER_URL);
      }
    },
    isMiniMode,
  );
  ```
  The ghost toggle closure captures `currentConfig` by reference and mutates it, then persists it via `putConfig`. The `currentConfig` variable is also mutated by the SSE listener (line 56–60). Two separate code paths mutate the same object.
- **Impact**: The tray's ghost toggle and the SSE config listener both mutate `currentConfig` without coordination. If an SSE `configChanged` event arrives while the user is toggling ghost mode via the tray, the mutations race. The 6-closure signature of `createTray` is hard to read and impossible to type-check for correctness at the call site.
- **Suggestion**: Define a `TrayActions` interface with named methods. Have `createTray` accept a single `TrayActions` object. Centralize config mutation in a single function that both the tray and SSE listener call.
- **Severity**: Low

---

- **Area**: `server/src/services/event-bus.ts`, consumed by 7 production modules
- **Observation**: The event bus uses a `Set<Listener>` at module scope and provides `subscribe`, `broadcast`, and `emit` functions. It is imported by:
  - `server/src/index.ts` (PID polling callback)
  - `server/src/routes/sessions/sessions.ts` (rename broadcast)
  - `server/src/routes/sessions/delete.ts` (delete broadcast)
  - `server/src/routes/config.ts` (config change emit)
  - `server/src/routes/events/events.ts` (notify broadcast, navigate emit, SSE reply)

  The bus carries two distinct message types: `"update"` (session changes) and `"configChanged"` / `"navigate"` (app-level events). These are distinguished only by the `event` string field in `SSEMessage`.

- **Impact**: The event bus creates hidden dependencies between modules. The config route emits `"configChanged"` which the desktop SSE listener consumes — but this dependency is invisible in the import graph. The `SSEMessage` type uses `event: string` and `data: Record<string, unknown>`, so there's no type safety on what events exist or what data they carry. A consumer could listen for `"configChagned"` (typo) and never receive messages.
- **Suggestion**: Type the event bus with a discriminated union of message types: `type BusMessage = { event: "update"; data: { sessionId: string; ... } } | { event: "configChanged"; data: WeaverConfig } | { event: "navigate"; data: { sessionId?: string; page?: string } }`. This makes the coupling explicit and type-checked.
- **Severity**: Low

### Deepening Candidates

- **Cluster**: `server/src/services/storage/sessions.ts`, `server/src/services/storage/lifecycle.ts`, `server/src/services/orphan-storage/paths.ts`, `server/src/services/log-parser/parse.ts`
- **Why they're coupled**: All four modules independently construct paths from `homedir()` + `".weaver"`. `lifecycle.ts` imports `readSessions` from `sessions.ts`. `parse.ts` constructs `LOGS_DIR` identically to `paths.ts`. They co-own the concept of "where Weaver data lives on disk."
- **Dependency category**: Local-substitutable (filesystem paths)
- **Test impact**: The 4 separate `vi.mock("node:os")` setups across test files would be replaced by a single mock of the centralized paths module. Tests for `lifecycle.ts` and `sessions.ts` currently both mock `homedir()` independently.

---

- **Cluster**: `server/src/services/webhook/handler.ts`, `server/src/services/webhook/dispatch.ts`, `server/src/services/webhook/payload-simple.ts`, `server/src/services/webhook/payload-advanced.ts`, `server/src/services/webhook/context.ts`, `server/src/services/webhook/types.ts`
- **Why they're coupled**: `handler.ts` orchestrates all other webhook modules. It calls `dispatch.ts`, selects between `payload-simple.ts` and `payload-advanced.ts` via `buildPayloadForFormat`, and both payload builders call `context.ts`. The `types.ts` file defines interfaces used by all of them. The module boundary between handler and dispatch is nearly transparent — `dispatch.ts` is 15 lines that wrap `fetch`.
- **Dependency category**: In-process
- **Test impact**: The webhook test files (`webhook-simple.test.ts`, `webhook-advanced.test.ts`) already test through the `handler.ts` entry point. The separate `context.test.ts` tests pure functions that could remain as unit tests. `dispatch.ts` is so thin that its test value comes only from the integration with `handler.ts`. Merging handler + dispatch and extracting session tracking would reduce the mock surface.

---

- **Cluster**: `server/src/services/skill-graph/discover.ts`, `server/src/services/skill-graph/get-skill-detail.ts`
- **Why they're coupled**: Both define `GLOBAL_SKILLS_PATH` independently. Both construct the same candidate path list pattern (workspace paths + global path). `get-skill-detail.ts` imports `skillCache` and `deriveProject` from `discover.ts`. They co-own the concept of "where to find skills."
- **Dependency category**: In-process
- **Test impact**: Both test files (`discover.test.ts`, `get-skill-detail.test.ts`) mock `homedir()` and `listSkillDirNames` independently. A unified skill path resolver would consolidate these mocks.

### Metrics

- Files examined: 56
- Findings: 12 (3 high, 5 medium, 4 low)
- Deepening candidates: 3
