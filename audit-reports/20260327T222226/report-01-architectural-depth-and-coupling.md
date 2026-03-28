# Audit Report: Architectural Depth and Coupling

## Summary

The monorepo's inter-package dependency graph is clean — every package imports only from `@weaver/shared`, with no lateral imports between `server`, `client`, `cli`, `hook-handler`, or `desktop`. However, `shared/sync/` contains a full feature implementation (filesystem I/O, config parsing, file patching) that belongs closer to its two consumers. The server's internal architecture relies heavily on module-level mutable state (seven distinct module-level `Set`/`Map`/interval handles across six files), creating hidden coupling between services that makes isolated testing impossible without process-level isolation. The desktop ↔ server boundary uses three different HTTP client strategies with no shared contract, making it fragile to API changes.

## Findings

### Finding 1: `shared/sync/` contains feature-level filesystem I/O, not shared utilities

- **Area**: `shared/sync/sync.ts`, `shared/sync/patch-agent-config.ts`, `shared/sync/project-config.ts`
- **Observation**: The `shared` package is positioned as types, paths, and utilities. But `shared/sync/` performs real filesystem operations: `readFileSync`, `writeFileSync`, `readdirSync`, `existsSync`. It reads `.weaver.json` from disk, parses and validates it with Zod schemas, calculates timeout values, scans two directories for agent config files, and patches them in-place. This is a complete feature — "sync validation timeouts to agent configs" — living in the shared layer.

  The two consumers are:
  - `cli/src/commands/sync.ts`: calls `syncAgentTimeouts(process.cwd(), { dryRun })`
  - `hook-handler/src/sync/sync-entry.ts`: calls `syncAgentTimeouts(cwd)`

  Additionally, `hook-handler/src/config/project-config/index.ts` is a single-line re-export:

  ```ts
  export { readProjectConfig } from "@weaver/shared/sync";
  ```

  This creates a wrapper module whose entire implementation is a forwarding import.

- **Impact**: The `shared` package now has a `zod` dependency and performs disk writes. Any consumer that depends on `@weaver/shared/sync` gets filesystem side effects. The `shared` package can no longer be treated as a pure types+utilities layer. Changes to the sync logic require rebuilding `shared`, which triggers rebuilds of all six downstream packages via Turborepo.

- **Suggestion**: Move `shared/sync/` into `hook-handler` (its primary consumer) and have `cli` import from `hook-handler` or extract a small `sync` workspace package. Keep `shared` limited to types, path helpers, and pure utilities. Remove the `zod` dependency from `shared` if possible (the schemas in `shared/sync/schemas.ts` are the only consumer).

- **Severity**: High

---

### Finding 2: Seven module-level mutable singletons across the server create hidden inter-service coupling

- **Area**: Multiple files in `server/src/services/`
- **Observation**: The server uses module-level mutable state in at least seven locations:

  | File                                  | State             | Type                                            |
  | ------------------------------------- | ----------------- | ----------------------------------------------- |
  | `services/event-bus.ts`               | `listeners`       | `Set<Listener>`                                 |
  | `services/storage/lifecycle.ts`       | `cleanupInterval` | `NodeJS.Timeout \| null`                        |
  | `services/storage/lifecycle.ts`       | `pidPollInterval` | `NodeJS.Timeout \| null`                        |
  | `services/storage/lifecycle.ts`       | `openPids`        | `Set<number>`                                   |
  | `services/storage/sessions.ts`        | `sessionCache`    | `FileCache<Session[]>`                          |
  | `services/log-parser/parse.ts`        | `logCache`        | `FileCache<HookEvent[]>`                        |
  | `services/skill-graph/discover.ts`    | `skillCache`      | `FileCache<ParsedSkill>`                        |
  | `services/webhook/session-tracker.ts` | `enabledSessions` | `Set<string>`                                   |
  | `services/webhook/handler.ts`         | `pendingTracker`  | `PendingTracker` (wraps `Map<string, Timeout>`) |
  | `services/keep-awake.ts`              | `interval`        | `NodeJS.Timeout \| null`                        |

  These singletons are wired together implicitly. For example, `server/src/index.ts` calls:

  ```ts
  startPidPolling((sessionId) => broadcast(sessionId));
  ```

  This passes the event bus's `broadcast` function as a callback to the lifecycle module, creating a runtime dependency that isn't visible in the import graph. The lifecycle module's `startPidPolling` reads sessions (touching `sessionCache`), checks PIDs, and calls back into the event bus — three singletons involved in one operation.

  The `keep-awake.ts` module similarly reaches across boundaries: it imports `readSessions` and `isProcessRunning` from storage, and `getLastEvent` and `deriveActivity` from log-parser, combining four module-level caches in a single polling loop.

- **Impact**: Tests must mock at the `vi.mock()` module level (as seen in `lifecycle.test.ts` which imports three mock setup files). You cannot create two independent server instances in the same process. The shutdown sequence in `index.ts` must manually call `stopWebhookTimers()`, `stopStaleSessionCleanup()`, and `stopKeepAwake()` — if a new interval-based service is added and the shutdown call is forgotten, it leaks.

- **Suggestion**: Introduce a `ServerContext` or dependency container that holds the caches, event bus, and interval handles. Pass it through route registration and service functions. This makes the dependency graph explicit and allows tests to create isolated contexts. The `PendingTracker` in `webhook/pending-tracker.ts` already demonstrates this pattern — it's a factory function (`createPendingTracker()`) rather than a module-level singleton.

- **Severity**: High

---

### Finding 3: Three different HTTP client strategies across desktop and CLI with no shared contract

- **Area**: `desktop/src/config.ts`, `desktop/src/sse.ts`, `desktop/src/server.ts`, `desktop/src/window.ts`, `cli/src/utils.ts`
- **Observation**: The codebase uses four distinct approaches to communicate with the same server API:
  1. **Node.js `http` module** — `desktop/src/config.ts` and `desktop/src/sse.ts`:
     ```ts
     http.get(`${baseUrl}/api/config`, (res) => { ... })
     ```
  2. **Global `fetch()`** — `desktop/src/window.ts`:
     ```ts
     await fetch(`${serverUrl}/api/navigate`, { method: "POST", ... })
     ```
  3. **`curl` via `execSync`** — `cli/src/utils.ts`:
     ```ts
     execSync(`curl -s --max-time 3 -w "\\n%{http_code}" ${args}`, ...)
     ```
  4. **Browser `fetch()`** — `client/src/utils/api.ts` (expected, this is the React app)

  The desktop `config.ts` manually casts the response:

  ```ts
  resolve((JSON.parse(body) as { config: WeaverConfig }).config);
  ```

  This is an implicit contract — if the server changes the response shape from `{ config: WeaverConfig }` to something else, this breaks silently at runtime with no type error.

  The port `8143` is hardcoded in both `server/src/index.ts` (`const PORT = 8143`) and `desktop/src/server.ts` (`export const SERVER_PORT = 8143`). These are independent constants that must be kept in sync manually.

- **Impact**: API changes require updating response parsing in multiple files using different HTTP libraries. The `curl`-based approach in the CLI means HTTP errors are swallowed into a generic `{ ok: false, status: 0, data: null }` shape. The port duplication is a correctness risk if either side changes independently.

- **Suggestion**: Extract the port constant into `@weaver/shared/paths` (or a new `shared/constants`). For the desktop package, standardize on one HTTP approach (Node.js `http` or `fetch` — Electron supports both). Consider a thin typed API client in `shared` that both desktop and CLI can use, or at minimum share the response type assertions.

- **Severity**: Medium

---

### Finding 4: Server entry point creates Fastify instance at module level

- **Area**: `server/src/index.ts`
- **Observation**: The server entry point creates the Fastify instance at module scope:

  ```ts
  const server = Fastify();
  // ... register routes ...
  registerHealthRoute(server);
  registerSessionRoutes(server);
  // ...
  ```

  Then `start()` calls `server.listen()`. This means importing `server/src/index.ts` (even in tests) immediately creates a Fastify instance and registers all routes. The route registration functions take a `FastifyInstance` parameter, which is good — but they're called unconditionally at import time.

  The route handlers themselves reach directly into module-level service singletons:

  ```ts
  // sessions.ts route handler
  const sessions = await readSessions(); // touches sessionCache singleton
  const isOpen = isProcessRunning(s.pid); // touches lifecycle module state
  broadcast(sessionId); // touches event bus singleton
  ```

- **Impact**: You cannot import the server module without triggering side effects. Integration tests must either mock the entire module or spin up a real server. The route handlers are tightly coupled to the service singletons — you can't test a route handler with a different storage backend without module-level mocking.

- **Suggestion**: Export a `createServer()` factory function that accepts dependencies (or at minimum, creates the Fastify instance inside the function). This is a common Fastify pattern. The current `start()` function is close — it just needs the Fastify creation and route registration moved inside it.

- **Severity**: Medium

---

### Finding 5: Excessive barrel file indirection with zero-value re-export layers

- **Area**: Multiple `index.ts` files across the codebase
- **Observation**: Several barrel files add an indirection layer with no abstraction value:

  | File                                              | Content                                                   | Value                                             |
  | ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
  | `server/src/services/config/index.ts`             | `export * from "./config"`                                | Zero — single file re-export                      |
  | `server/src/services/file-cache/index.ts`         | `export * from "./file-cache"`                            | Zero — single file re-export                      |
  | `server/src/routes/events/index.ts`               | `export * from "./events"`                                | Zero — single file re-export                      |
  | `server/src/routes/sessions/index.ts`             | `export { registerSessionRoutes } from "./sessions"`      | Zero — single symbol                              |
  | `server/src/routes/orphans/index.ts`              | Single re-export (27 bytes)                               | Zero                                              |
  | `hook-handler/src/config/project-config/index.ts` | `export { readProjectConfig } from "@weaver/shared/sync"` | Negative — adds indirection to an external import |

  The `hook-handler/src/config/project-config/index.ts` case is particularly notable: it's a directory containing a single `index.ts` that re-exports one symbol from another package. The consumer `hook-handler/src/config/find-config/find-config.ts` imports from `"../project-config"` instead of directly from `"@weaver/shared/sync"`, adding a hop that obscures the true dependency.

- **Impact**: Each barrel file is a file that must be maintained, appears in stack traces, and adds cognitive overhead when navigating the codebase. The `project-config/index.ts` wrapper actively hides the fact that `readProjectConfig` comes from `shared`, making dependency analysis harder.

- **Suggestion**: Remove zero-value barrel files. Import directly from the implementation file. For `hook-handler/src/config/project-config/`, delete the directory and import `readProjectConfig` directly from `@weaver/shared/sync` in `find-config.ts`.

- **Severity**: Low

---

### Finding 6: Event bus is a clean deep module but lacks backpressure and error isolation

- **Area**: `server/src/services/event-bus.ts`
- **Observation**: The event bus has a small, clean interface — 4 exported functions (`subscribe`, `broadcast`, `emit`, `sseReply`) hiding listener management and SSE formatting. This is a good deep module. The test file (`event-bus.test.ts`) covers all four functions thoroughly.

  However, `emit` calls every listener synchronously with no error isolation:

  ```ts
  export function emit(msg: SSEMessage): void {
    listeners.forEach((listener) => listener(msg));
  }
  ```

  If a listener throws, subsequent listeners won't receive the message. The `sseReply` function's listener calls `reply.raw.write()` which can fail if the connection is broken between the `close` event and the write attempt.

  The `broadcast` function is used as a callback from `startPidPolling` in `lifecycle.ts`, creating a cross-module dependency that's invisible in the import graph of `lifecycle.ts` (it receives `broadcast` as a parameter, not an import).

- **Impact**: A single broken SSE connection could prevent other listeners from receiving updates if `write()` throws synchronously. In practice this is unlikely (Node streams buffer writes), but the lack of try/catch means it's a latent risk. The callback-based wiring between lifecycle and event-bus is actually a good pattern (dependency injection), but it's the only service that uses it — the rest use direct imports.

- **Suggestion**: Wrap each listener call in a try/catch within `emit()`. This is a one-line fix that prevents cascading failures. The callback injection pattern used for `startPidPolling` is good — consider extending it to other cross-service dependencies.

- **Severity**: Low

---

### Finding 7: Desktop SSE client manually parses the SSE protocol with regex

- **Area**: `desktop/src/sse.ts`
- **Observation**: The SSE client in the desktop package manually parses the SSE wire format:

  ```ts
  const eventMatch = part.match(/^event: (.+)$/m);
  const dataMatch = part.match(/^data: (.+)$/m);
  ```

  This handles the happy path but doesn't account for multi-line `data:` fields, `id:` fields, or `retry:` directives that are part of the SSE spec. The server's `sseReply` function formats messages as:

  ```ts
  `event: ${msg.event}\ndata: ${JSON.stringify(msg.data)}\n\n`;
  ```

  So the current format is always single-line data, making the regex sufficient today. But if the server ever sends multi-line data or adds SSE features, the desktop client will silently drop or mangle messages.

  The reconnection logic is a simple `setTimeout(connect, 1000)` with no backoff, which could hammer the server during extended outages.

- **Impact**: The implicit contract between `sseReply`'s output format and `subscribeSSE`'s parsing regex is fragile. Changes to the server's SSE formatting could break the desktop client with no compile-time warning.

- **Suggestion**: Use the `EventSource` API if available in the Electron renderer, or use a minimal SSE parser library. If keeping the manual parser, add a comment documenting the assumed format and link it to the server's `sseReply` function.

- **Severity**: Low

---

### Finding 8: CLI uses `curl` via `execSync` for HTTP requests

- **Area**: `cli/src/utils.ts`
- **Observation**: The CLI package shells out to `curl` for all HTTP communication:

  ```ts
  function curl(args: string): HttpResult {
    try {
      const result = execSync(
        `curl -s --max-time 3 -w "\\n%{http_code}" ${args}`,
        { encoding: "utf-8" },
      );
  ```

  This means the CLI requires `curl` to be installed on the system. On macOS this is always available, but it's an unusual choice when Node.js has built-in `http`/`https` modules and global `fetch()`. The `execSync` call blocks the event loop and the error handling collapses all failures (network errors, timeouts, malformed JSON) into `{ ok: false, status: 0, data: null }`.

  The `post` function constructs the curl command with string interpolation:

  ```ts
  `-d '${JSON.stringify(body)}'`;
  ```

  If `body` contains single quotes, this will produce a malformed shell command.

- **Impact**: The `curl` dependency is implicit and undocumented. The string interpolation in shell commands is a correctness risk for payloads containing special characters. The synchronous execution blocks the CLI process during the HTTP request.

- **Suggestion**: Replace `curl` with Node.js `fetch()` (available since Node 18) or the `http` module. This removes the external dependency, fixes the shell injection risk, and allows async execution.

- **Severity**: Medium

---

## Deepening Candidates

### Candidate 1: Storage + Lifecycle → SessionManager

- **Cluster**: `server/src/services/storage/sessions.ts`, `server/src/services/storage/lifecycle.ts`, `server/src/services/storage/index.ts`
- **Why they're coupled**: `lifecycle.ts` imports `readSessions` from `sessions.ts`. Both share the concept of "session state" — sessions manages the JSONL persistence and cache, lifecycle manages PID polling and stale cleanup. The `index.ts` barrel re-exports everything from both, treating them as one unit. The `openPids` set in lifecycle is conceptually part of session state.
- **Dependency category**: In-process
- **Test impact**: `lifecycle.test.ts` already mocks `readSessions`. A merged `SessionManager` class could be tested with a real in-memory implementation, replacing the module-level mocks with constructor injection. The existing `sessions.test.ts` tests would become internal implementation tests of the manager.

### Candidate 2: Log Parser modules → single deep module

- **Cluster**: `server/src/services/log-parser/parse.ts`, `group-turns.ts`, `tool-calls.ts`, `activity.ts`, `types.ts`, `index.ts`
- **Why they're coupled**: `group-turns.ts` imports `matchToolCalls` from `tool-calls.ts` and `isValidationEvent` from `types.ts`. `parse.ts` provides the raw events that all other modules consume. The barrel `index.ts` exports 5 symbols from 4 files. These modules collectively implement "parse a session log into structured turns" — a single concept split across 5 files.
- **Dependency category**: In-process
- **Test impact**: Each file has its own test file. A merged module would consolidate these into boundary tests: "given raw JSONL, produce TurnGroup[]". The internal `matchToolCalls` and `isValidationEvent` functions would become private implementation details, reducing the public API surface.

### Candidate 3: Webhook subsystem consolidation

- **Cluster**: `server/src/services/webhook/handler.ts`, `dispatch.ts`, `session-tracker.ts`, `pending-tracker.ts`, `context.ts`, `payload-simple.ts`, `payload-advanced.ts`, `types.ts`, `index.ts`
- **Why they're coupled**: `handler.ts` imports from `dispatch.ts`, `session-tracker.ts`, `pending-tracker.ts`, `payload-simple.ts`, `payload-advanced.ts`, and `types.ts`. The `session-tracker.ts` is a 12-line file with a module-level `Set`. The `dispatch.ts` is a single `fetch` call. These are all implementation details of "deliver webhook notifications" — a single feature spread across 9 files.
- **Dependency category**: In-process (with one remote call to the webhook URL)
- **Test impact**: The existing tests in `__tests__/webhook-simple.test.ts` and `webhook-advanced.test.ts` already test the integrated behavior. The unit tests for `dispatch.test.ts`, `session-tracker.test.ts`, and `pending-tracker.test.ts` test trivial implementations. A consolidated module would keep the integration tests and drop the unit tests for the trivial pieces.

## Metrics

- Files examined: 72
- Findings: 8 (2 high, 3 medium, 3 low)
- Deepening candidates: 3
