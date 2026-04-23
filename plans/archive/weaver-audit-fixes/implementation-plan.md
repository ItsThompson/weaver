# Implementation Plan: Weaver Audit Fixes

## OVERVIEW

Fix 9 high-severity findings from the codebase audit, shipped as a single branch.

### Fixes included

| # | Finding | Category |
|---|---------|----------|
| 1 | Non-atomic file writes to sessions.jsonl, config.json, orphan.jsonl | Data integrity |
| 2 | `execFileSync` blocks the event loop in `isProcessRunning` | Runtime safety |
| 3 | 7 module-level mutable singletons prevent isolated testing | Architecture |
| 4 | 53+ raw `console.log`/`console.error` calls across hook-handler, cli, desktop | Observability |
| 5 | No Zod validation on server route request bodies | Validation |
| 6 | `lifecycle.ts` orchestration functions completely untested | Test coverage |
| 7 | CherrypickPage: 0 test files for the entire feature | Test coverage |
| 8 | SkillDetailPage is monolithic — no hook extraction | Frontend structure |
| 9 | SessionDetailPage has no hook extraction | Frontend structure |

### Success criteria

- All existing tests pass (no regressions)
- `npm test` passes in all workspace packages
- `npm run build` succeeds in all workspace packages
- Each fix has its own acceptance tests as specified per step

### Assumptions and constraints

- macOS-only tool; `rename()` is atomic on POSIX within the same filesystem
- Node.js 18+ (global `fetch` available, `execFile` from `child_process` available)
- Turborepo monorepo with 6 workspace packages: `server`, `client`, `cli`, `hook-handler`, `desktop`, `shared`
- The `shared/sync/` relocation (original finding #3) is explicitly out of scope
- Existing test infrastructure uses Vitest with `vi.mock()` patterns
- The `createPendingTracker()` factory in `server/src/services/webhook/pending-tracker.ts` is the reference pattern for singleton refactors

## APPROACH

### High-level solution design

1. **Atomic writes**: Create a `server/src/utils/atomic-write.ts` utility that writes to a `.tmp` sibling then calls `rename()`. Apply to the 3 write sites.
2. **Async PID checking**: Replace `execFileSync("ps", ...)` with promisified `execFile`. Make `isProcessRunning` async. Update all callers.
3. **Factory pattern for singletons**: Convert 5 modules to factory functions following the `createPendingTracker` pattern. Each factory encapsulates mutable state and returns a controller object. Export a default instance so all existing imports continue to work unchanged.
4. **Structured logging**: Create a `print()` function for CLI user-facing output. Convert `console.error` calls in hook-handler and desktop to structured `log()` calls with context.
5. **Zod route validation**: Add `zod` and `zod-to-json-schema` to the server package. Define Zod schemas for each route body. Wire into Fastify's `schema: { body }` option for automatic 400 responses.
6. **Lifecycle tests**: Test `startPidPolling` and `startStaleSessionCleanup` against the new factory interface using fake timers and injected dependencies.
7. **CherrypickPage tests**: Test `useCherrypick` hook with `renderHook` covering the 3-phase state machine.
8. **SkillDetailPage hook extraction**: Extract `useSkillDetailPage` returning `{ state, actions }`.
9. **SessionDetailPage hook extraction**: Extract `useSessionDetailPage` returning `{ state, actions }`.

### Key architectural decisions

- **Factory pattern preserves backward compatibility**: Each refactored module exports both a `createX()` factory AND destructured exports from a default instance. No existing import statements need to change. Route handlers, server index.ts, and barrel exports remain untouched.
- **Dependency injection via factory params**: Factory functions accept their cross-module dependencies as parameters (e.g., `createLifecycleManager({ readSessions, isProcessRunning })`). Default instances wire in the real implementations. Tests inject mocks.
- **Zod schemas as source of truth**: Zod schemas define the runtime validation. `zod-to-json-schema` converts them for Fastify's built-in Ajv validation. Manual `typeof` checks are removed from handlers.
- **`print()` vs `log()` split**: CLI user-facing output uses `print()` (writes to stdout, human-readable). Diagnostic/error output uses structured `log()` (JSON to stderr). hook-handler and desktop convert all `console.*` to structured logging.

### Development workflow

| Step | Complexity | Levels | Rationale |
|------|-----------|--------|-----------|
| 1 (atomic writes) | Simple | ATDD | Single responsibility, follows data-safety pattern |
| 2 (async isProcessRunning) | Simple | ATDD | Mechanical sync→async conversion |
| 3 (structured logging) | Simple | ATDD | Mechanical replacement, no new logic |
| 4 (factory: event-bus) | Moderate | ATDD + BDD | New state encapsulation pattern, 2 modules touched |
| 5 (factory: storage + lifecycle + tests) | Complex | ATDD + BDD + TDD | Cross-module deps, interval management, PID tracking state machine |
| 6 (factory: keep-awake + log-parser) | Moderate | ATDD + BDD | Same pattern as step 4, 2 modules |
| 7 (Zod route validation) | Moderate | ATDD + BDD | Multiple routes, schema design, Fastify integration |
| 8 (CherrypickPage tests) | Moderate | ATDD + BDD | 3-phase state machine, file parsing, selection logic |
| 9 (SkillDetailPage extraction) | Moderate | ATDD + BDD | Multiple queries, derived state, mutations |
| 10 (SessionDetailPage extraction) | Moderate | ATDD + BDD | Linked state, action handlers |

## IMPLEMENTATION STEPS

### Step 1: Atomic file writes

**Workflow**: Simple → ATDD only

**Goal**: Prevent data corruption from crashes during file writes by using write-to-temp-then-rename.

**What to do**:

1. Create `server/src/utils/atomic-write.ts`:
   ```typescript
   import { writeFile, rename } from "node:fs/promises";

   export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
     const tmpPath = `${filePath}.tmp`;
     await writeFile(tmpPath, content, "utf-8");
     await rename(tmpPath, filePath);
   }
   ```

2. Create `server/src/utils/atomic-write.test.ts` with acceptance tests (see Testing Strategy).

3. Update these 3 call sites to use `atomicWriteFile`:
   - `server/src/services/storage/sessions.ts` — `writeSessions()` function (line 44): replace `await writeFile(sessionsPath(), content, "utf-8")` with `await atomicWriteFile(sessionsPath(), content)`
   - `server/src/services/config/config.ts` — `writeConfig()` function (line 66-70): replace the `writeFile` call with `await atomicWriteFile(configPath(), JSON.stringify(config, null, 2) + "\n")`
   - `server/src/services/orphan-storage/helpers.ts` — `writeRemaining()` function (line 57): replace `return writeFile(filePath, ...)` with `return atomicWriteFile(filePath, ...)`

4. Update imports: each file replaces `import { writeFile } from "node:fs/promises"` with `import { atomicWriteFile } from "../../utils/atomic-write"` (adjust relative path per file). Remove `writeFile` from the `node:fs/promises` import if it's no longer used directly (check — `sessions.ts` also uses `appendFile` and `mkdir`, `config.ts` also uses `readFile`, `helpers.ts` only uses `writeFile`).

**Acceptance criteria**:
- Given a valid file path and content, when `atomicWriteFile` is called, then the file contains the expected content
- Given a file path, when `atomicWriteFile` is called, then a `.tmp` file is created and then renamed (not a direct write to the target)
- Given the 3 updated call sites, when `writeSessions`, `writeConfig`, or `writeRemaining` is called, then they use `atomicWriteFile` internally
- All existing tests in `server/` pass: `cd server && npx vitest run`

**Done when**: `atomic-write.test.ts` passes, all existing server tests pass, no direct `writeFile` calls remain in the 3 target functions.

---

### Step 2: Async `isProcessRunning`

**Workflow**: Simple → ATDD only

**Goal**: Stop blocking the event loop during PID checks by converting `execFileSync` to async `execFile`.

**What to do**:

1. In `server/src/services/storage/lifecycle.ts`:
   - Replace `import { execFileSync } from "node:child_process"` with `import { execFile } from "node:child_process"` and `import { promisify } from "node:util"`
   - Add `const execFileAsync = promisify(execFile);`
   - Change `isProcessRunning` signature from `export function isProcessRunning(pid: number): boolean` to `export async function isProcessRunning(pid: number): Promise<boolean>`
   - Replace the `execFileSync` call with `const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "args="])` and `return stdout.includes("kiro-cli")`
   - The `process.kill(pid, 0)` check at the top should remain synchronous (it's a signal check, not a subprocess)
   - Wrap the whole function body in try/catch returning false on any error

2. Update all callers of `isProcessRunning` to await it:
   - `server/src/services/storage/lifecycle.ts` — `cleanStaleSessions()`: the `isProcessRunning` call is inside a `reduce` callback. Change the reduce to an async loop or use `Promise.all` with `map`. Specifically, replace the `sessionFiles.reduce<{ file: string; pid: number }[]>(...)` with a `Promise.all(sessionFiles.map(async (file) => { ... }))` pattern that filters after resolution.
   - `server/src/services/storage/lifecycle.ts` — `startPidPolling()`: the `isProcessRunning` call is inside `sessions.reduce(...)`. Replace with `Promise.all(sessions.map(async (session) => ({ session, alive: await isProcessRunning(session.pid) })))` then filter.
   - `server/src/services/keep-awake.ts` — `hasActiveSessions()`: already in an async function with a for-loop, just add `await` before `isProcessRunning(s.pid)`.
   - `server/src/routes/sessions/sessions.ts` — `GET /api/sessions` handler: `isProcessRunning(s.pid)` is already inside an `async` map callback, just add `await`.
   - `server/src/routes/sessions/sessions.ts` — `GET /api/sessions/:id` handler: `isProcessRunning(session.pid)` is in an async handler, just add `await`.

3. Update the barrel export in `server/src/services/storage/index.ts` — no change needed, the export signature updates automatically.

4. Update `server/src/__tests__/mocks/services.ts` — change the `isProcessRunning` mock from `vi.fn()` to `vi.fn().mockResolvedValue(false)` (async mock). Update `server/src/__tests__/mocks/child-process.ts` if it mocks `execFileSync` — it should now mock `execFile` or be removed if no longer needed.

5. Update `server/src/services/storage/lifecycle.test.ts`:
   - The `isProcessRunning` tests need to become async: `it("returns true for a running kiro-cli process", async () => { ... await expect(isProcessRunning(process.pid)).resolves.toBe(true) })`
   - The `cleanStaleSessions` tests that rely on `isProcessRunning` behavior should still work since they mock `execFileSync`/`execFile` at the module level — update the mock to use `execFile` callback pattern or the promisified version.
   - Read `server/src/__tests__/mocks/child-process.ts` to understand the current mock pattern and update accordingly.

6. Update route test files that mock `isProcessRunning`:
   - `server/src/routes/sessions/sessions.test.ts` uses `vi.mocked(isProcessRunning).mockImplementation(...)` and `vi.mocked(isProcessRunning).mockReturnValue(...)`. Change to `.mockResolvedValue(...)` and `.mockImplementation((pid) => Promise.resolve(pid === 100))`.

**Acceptance criteria**:
- Given a running kiro-cli process, when `isProcessRunning` is called, then it returns a Promise that resolves to `true`
- Given a dead PID, when `isProcessRunning` is called, then it returns a Promise that resolves to `false`
- Given the server is handling HTTP requests, when PID polling runs, then the event loop is not blocked (no `execFileSync` calls remain in non-test code)
- All existing tests in `server/` pass after updating mocks: `cd server && npx vitest run`

**Done when**: No `execFileSync` imports remain in `lifecycle.ts`. All callers await the result. All server tests pass.

---

### Step 3: Structured logging — print/log split

**Workflow**: Simple → ATDD only

**Goal**: Replace raw `console.*` calls with structured logging in hook-handler and desktop, and create a `print()`/`log()` split for the CLI.

**What to do**:

1. Create `cli/src/utils/output.ts`:
   ```typescript
   /** User-facing output to stdout — human-readable, not structured */
   export function print(...args: unknown[]): void {
     console.log(...args);
   }

   /** Structured diagnostic log to stderr — machine-parseable */
   export function cliLog(event: string, data?: Record<string, unknown>): void {
     console.error(JSON.stringify({ timestamp: new Date().toISOString(), event, ...data }));
   }
   ```

2. Update CLI command files to use `print()` for user output and `cliLog()` for errors:
   - `cli/src/commands/config.ts` (14 calls): Replace `console.log(...)` with `print(...)` for user-facing output. Replace `console.error(...)` with `cliLog("config_error", { error: ... })` for error cases.
   - `cli/src/commands/session.ts` (9 calls): Same pattern.
   - `cli/src/commands/rename.ts` (5 calls): Same pattern.
   - `cli/src/commands/view.ts` (4 calls): Same pattern.
   - `cli/src/commands/sync.ts` (3 calls): Same pattern.
   - `cli/src/commands/toggle.ts` (3 calls): Same pattern.
   - `cli/src/index.ts` (2 calls): Same pattern.
   - Read each file first to determine which calls are user-facing vs diagnostic.

3. Update hook-handler files to use structured logging:
   - Create `hook-handler/src/utils/logger.ts` with the same `log()` pattern as `server/src/utils/logger.ts`:
     ```typescript
     export interface LogEntry { timestamp: string; event: string; [key: string]: unknown; }
     export function log(entry: LogEntry): void { console.error(JSON.stringify(entry)); }
     ```
     Note: hook-handler writes to stderr since it runs as a child process and stdout is reserved for output to kiro-cli.
   - `hook-handler/src/inject/run-inject/run-inject.ts` (3 calls): Replace `console.error("Failed to parse pending file:", path, e)` with `log({ timestamp: new Date().toISOString(), event: "pending_parse_error", path, error: String(e) })`. Same for the `console.warn` calls.
   - `hook-handler/src/validate/exit.ts` (1 call): Replace `console.error("Failed to write pending file:", path, e)` with structured log.
   - `hook-handler/src/validate/logging.ts` (1 call): Replace the `.catch(() => {})` on the fetch with `.catch((err) => log({ timestamp: new Date().toISOString(), event: "notify_server_error", error: String(err) }))`.
   - `hook-handler/src/config/test-runners/test-runners.ts` (1 call): Replace `console.error("Failed to parse ~/.weaver/config.json:", e)` with structured log.

4. Update desktop files to use structured logging:
   - Create `desktop/src/utils/logger.ts` with the same pattern (uses `console.log` since desktop logs go to Electron's stdout):
     ```typescript
     export interface LogEntry { timestamp: string; event: string; [key: string]: unknown; }
     export function log(entry: LogEntry): void { console.log(JSON.stringify(entry)); }
     ```
   - `desktop/src/install-cli.ts` (3 calls): Replace `console.log("Symlinked ...")` with `log({ ..., event: "cli_symlinked", ... })`. Replace `console.warn(...)` with `log({ ..., event: "cli_install_skipped", ... })`.
   - `desktop/src/server.ts` (2 calls): Replace `console.log("Killed orphaned process ...")` with structured log. Replace `console.error("Server exited ...")` with structured log.
   - `desktop/src/main.ts` (1 call): Replace `console.error("Could not connect to server")` with structured log.
   - `desktop/src/sse.ts` (1 call): Replace `console.error("Failed to parse SSE data:", e)` with structured log.

**Acceptance criteria**:
- Given any source file in `hook-handler/src/`, when searched for `console.log\(|console.error\(|console.warn\(`, then zero matches are found
- Given any source file in `desktop/src/`, when searched for `console.log\(|console.error\(|console.warn\(`, then zero matches are found
- Given any source file in `cli/src/`, when searched for raw `console.log\(|console.error\(|console.warn\(`, then zero matches are found (all replaced with `print()` or `cliLog()`)
- All existing tests pass: `cd cli && npx vitest run` and `cd hook-handler && npx vitest run`

**Done when**: Zero raw `console.*` calls in hook-handler, desktop, and cli source files (excluding test files and the logger/output utility files themselves). All tests pass.

---

### Step 4: Factory pattern — event-bus

**Workflow**: Moderate → ATDD + BDD

**Depends on**: Nothing

**Goal**: Convert `server/src/services/event-bus.ts` from module-level mutable state to a factory function, following the `createPendingTracker` pattern in `server/src/services/webhook/pending-tracker.ts`.

**What to do**:

1. Read `server/src/services/webhook/pending-tracker.ts` to understand the reference factory pattern.

2. Refactor `server/src/services/event-bus.ts`:
   - Define an `EventBus` interface with the 4 public methods: `subscribe`, `broadcast`, `emit`, `sseReply`
   - Create `export function createEventBus(): EventBus` that encapsulates the `listeners` Set internally
   - Create a default instance at module level: `const defaultBus = createEventBus()`
   - Re-export the 4 functions from the default instance for backward compatibility:
     ```typescript
     export const { subscribe, broadcast, emit, sseReply } = defaultBus;
     ```
   - This ensures all existing imports (`import { broadcast } from "../../services/event-bus"`) continue to work unchanged.

3. Update `server/src/services/event-bus.test.ts`:
   - Keep existing tests (they test the default instance exports and should still pass)
   - Add new tests that use `createEventBus()` to verify isolated instances:
     - Given two separate event bus instances, when one emits, then the other's listeners are not called
     - Given a fresh event bus, when subscribe is called and then the unsubscribe function is called, then the listener is removed

4. Wrap each listener call in `emit()` with try/catch to prevent cascading failures (audit finding 6 from Report 1):
   ```typescript
   emit(msg: SSEMessage): void {
     listeners.forEach((listener) => {
       try { listener(msg); } catch { /* prevent one broken listener from blocking others */ }
     });
   }
   ```

**Acceptance criteria**:
- Given `createEventBus()`, when called twice, then two independent instances are returned with separate listener sets
- Given the default exports (`subscribe`, `broadcast`, `emit`, `sseReply`), when used as before, then behavior is unchanged
- Given a listener that throws, when `emit` is called with multiple listeners, then all listeners receive the message
- All existing server tests pass: `cd server && npx vitest run`

**BDD scenarios**:

Scenario: Isolated event bus instances
- Given I create two event buses with `createEventBus()`
- When I subscribe a listener to bus A and emit on bus B
- Then the listener on bus A is not called

Scenario: Listener error isolation
- Given an event bus with two subscribers, where the first throws
- When `emit` is called
- Then the second subscriber still receives the message

Scenario: Backward-compatible default exports
- Given existing code imports `{ broadcast }` from event-bus
- When `broadcast("session-1")` is called
- Then all default-instance listeners receive the update event

**Done when**: `createEventBus` is exported. Default exports still work. `event-bus.test.ts` passes with new isolation and error-handling tests. All server tests pass.

---

### Step 5: Factory pattern — storage (sessions + lifecycle) + lifecycle tests

**Workflow**: Complex → ATDD + BDD + TDD

**Depends on**: Step 2 (async `isProcessRunning`)

**Goal**: Convert `sessions.ts` and `lifecycle.ts` to factory functions. Write comprehensive tests for the previously-untested `startPidPolling` and `startStaleSessionCleanup` orchestration.

**What to do**:

1. Refactor `server/src/services/storage/sessions.ts`:
   - Define a `SessionStore` interface: `{ ensureDataDir, readSessions, appendSession, writeSessions }`
   - Create `export function createSessionStore(): SessionStore` that encapsulates the `sessionCache` FileCache internally
   - Create default instance and re-export for backward compatibility:
     ```typescript
     const defaultStore = createSessionStore();
     export const { ensureDataDir, readSessions, appendSession, writeSessions } = defaultStore;
     ```
   - Also export `_sessionCache` from the default instance for any existing test that references it

2. Refactor `server/src/services/storage/lifecycle.ts`:
   - Define a `LifecycleManager` interface:
     ```typescript
     export interface LifecycleManager {
       isProcessRunning(pid: number): Promise<boolean>;
       cleanStaleSessions(): Promise<void>;
       startStaleSessionCleanup(): void;
       startPidPolling(onSessionClosed: (sessionId: string) => void): void;
       stopStaleSessionCleanup(): void;
     }
     ```
   - Define a `LifecycleDeps` interface for injectable dependencies:
     ```typescript
     export interface LifecycleDeps {
       readSessions: () => Promise<Session[]>;
       log: (entry: LogEntry) => void;
       weaverDir: () => string;
     }
     ```
   - Create `export function createLifecycleManager(deps: LifecycleDeps): LifecycleManager` that:
     - Encapsulates `cleanupInterval`, `pidPollInterval`, and `openPids` Set internally
     - Implements `isProcessRunning` as the async version (from step 2)
     - Uses `deps.readSessions` instead of importing from `./sessions`
     - Uses `deps.log` instead of importing from `../../utils/logger`
     - Uses `deps.weaverDir` instead of importing from `@weaver/shared/paths`
   - Create default instance wired to real implementations:
     ```typescript
     import { readSessions } from "./sessions";
     import { log } from "../../utils/logger";
     import { weaverDir } from "@weaver/shared/paths";

     const defaultManager = createLifecycleManager({ readSessions, log, weaverDir });
     export const {
       isProcessRunning, cleanStaleSessions,
       startStaleSessionCleanup, startPidPolling, stopStaleSessionCleanup,
     } = defaultManager;
     ```
   - Remove the direct import of `readSessions` from `./sessions` at the top of the file (it's now injected via deps for the factory, and imported only for the default instance wiring)

3. Update `server/src/services/storage/index.ts` barrel — no changes needed since the same symbols are exported.

4. Write comprehensive tests in `server/src/services/storage/lifecycle.test.ts`:
   - Replace the existing test structure. The existing tests for `cleanStaleSessions` and `isProcessRunning` should be rewritten to use the factory with injected deps instead of module-level mocks.
   - Use `vi.useFakeTimers()` for interval-based tests.

   **TDD units for `startPidPolling`**:
   - RED: Test that `startPidPolling` calls `readSessions` on first invocation → GREEN: implement
   - RED: Test that when a PID disappears between polls, `onSessionClosed` is called with the session ID → GREEN: implement
   - RED: Test that when a PID appears for the first time, it's tracked without calling `onSessionClosed` → GREEN: implement
   - RED: Test that `stopStaleSessionCleanup` clears the polling interval → GREEN: implement
   - RED: Test that multiple poll cycles correctly track PID transitions → GREEN: implement

   **TDD units for `cleanStaleSessions`**:
   - RED: Test that stale marker files (dead PIDs) are deleted → GREEN: implement
   - RED: Test that marker files for live PIDs are preserved → GREEN: implement
   - RED: Test that readdir failure is handled gracefully → GREEN: implement

   **TDD units for `isProcessRunning`**:
   - RED: Test that a running kiro-cli process returns true → GREEN: implement
   - RED: Test that a dead PID returns false → GREEN: implement
   - RED: Test that PID reuse (alive but not kiro-cli) returns false → GREEN: implement

   Each test should create a fresh `createLifecycleManager(mockDeps)` instance. No module-level mocking needed.

**Acceptance criteria**:
- Given `createLifecycleManager(deps)`, when called with mock deps, then an isolated manager is returned with its own interval handles and PID tracking state
- Given `startPidPolling` is running and a tracked PID disappears, when the next poll fires, then `onSessionClosed` is called with the correct session ID
- Given `startStaleSessionCleanup` is running, when a marker file exists for a dead PID, then the marker file is deleted
- Given `stopStaleSessionCleanup` is called, when timers are active, then all intervals are cleared
- Given the default exports from `lifecycle.ts`, when used by existing code, then behavior is unchanged
- All existing server tests pass: `cd server && npx vitest run`

**BDD scenarios**:

Scenario: PID disappears between polls
- Given a lifecycle manager with a mock `readSessions` returning session with PID 100
- And `isProcessRunning` returns true for PID 100 on the first poll
- When `isProcessRunning` returns false for PID 100 on the second poll
- Then `onSessionClosed` is called with the session's ID

Scenario: New PID appears
- Given a lifecycle manager with no previously tracked PIDs
- When a poll finds session with PID 200 that is alive
- Then PID 200 is tracked and `onSessionClosed` is NOT called

Scenario: Stale marker cleanup
- Given a lifecycle manager and a `.current-session-999` marker file exists
- And PID 999 is not running
- When `cleanStaleSessions` runs
- Then the marker file is deleted

Scenario: Isolated instances
- Given two lifecycle managers created with `createLifecycleManager`
- When one starts PID polling
- Then the other's state is unaffected

**Done when**: `createLifecycleManager` is exported with dependency injection. All orchestration functions (`startPidPolling`, `startStaleSessionCleanup`, `stopStaleSessionCleanup`) have tests. Default exports maintain backward compatibility. All server tests pass.

---

### Step 6: Factory pattern — keep-awake + log-parser cache

**Workflow**: Moderate → ATDD + BDD

**Depends on**: Step 2 (async `isProcessRunning`), Step 5 (storage factory — since keep-awake imports from storage)

**Goal**: Convert `keep-awake.ts` and `log-parser/parse.ts` to factory functions.

**What to do**:

1. Refactor `server/src/services/log-parser/parse.ts`:
   - The module has a `logCache` FileCache at module level and exports `parseLogFile`, `getLastEvent`
   - Create `export function createLogParser(): { parseLogFile, getLastEvent, _logCache }` that encapsulates the cache
   - Create default instance and re-export:
     ```typescript
     const defaultParser = createLogParser();
     export const { parseLogFile, getLastEvent } = defaultParser;
     export const _logCache = defaultParser._logCache;
     ```

2. Refactor `server/src/services/keep-awake.ts`:
   - Define deps interface:
     ```typescript
     interface KeepAwakeDeps {
       readSessions: () => Promise<Session[]>;
       isProcessRunning: (pid: number) => Promise<boolean>;
       getLastEvent: (sessionId: string) => Promise<LastEvent | null>;
       deriveActivity: (eventName: string, timestamp?: string) => string;
       log: (entry: LogEntry) => void;
     }
     ```
   - Create `export function createKeepAwake(deps: KeepAwakeDeps)` that encapsulates the `interval` handle
   - Returns `{ startKeepAwake(scriptPath: string): void, stopKeepAwake(): void }`
   - Create default instance wired to real implementations:
     ```typescript
     const defaultKeepAwake = createKeepAwake({
       readSessions, isProcessRunning, getLastEvent, deriveActivity, log,
     });
     export const { startKeepAwake, stopKeepAwake } = defaultKeepAwake;
     ```

3. Write tests:
   - `server/src/services/log-parser/parse.test.ts`: Add a test that `createLogParser()` returns isolated instances (two parsers don't share cache state). Existing tests for `parseLogFile` should continue to pass.
   - `server/src/services/keep-awake.test.ts`: If this file doesn't exist, create it. Test with fake timers and injected deps:
     - Given active sessions, when poll fires, then the keep-awake script is executed
     - Given no active sessions, when poll fires, then the script is NOT executed
     - Given `stopKeepAwake` is called, then the interval is cleared

**Acceptance criteria**:
- Given `createLogParser()`, when called twice, then two independent instances with separate caches are returned
- Given `createKeepAwake(deps)`, when called with mock deps, then an isolated keep-awake controller is returned
- Given the default exports, when used by existing code, then behavior is unchanged
- All existing server tests pass: `cd server && npx vitest run`

**BDD scenarios**:

Scenario: Isolated log parser caches
- Given two log parsers created with `createLogParser()`
- When parser A caches a log file
- Then parser B does not have that file cached

Scenario: Keep-awake polls and executes script
- Given a keep-awake instance with mock deps where `hasActiveSessions` returns true
- When the poll interval fires
- Then the keep-awake script is executed via `execFile`

Scenario: Keep-awake stops cleanly
- Given a running keep-awake instance
- When `stopKeepAwake` is called
- Then the interval is cleared and no more polls fire

**Done when**: Both modules export factory functions. Default exports maintain backward compatibility. Tests verify isolation. All server tests pass.

---

### Step 7: Zod route validation

**Workflow**: Moderate → ATDD + BDD

**Depends on**: Nothing (route handlers are independent of the factory refactors since barrel exports are unchanged)

**Goal**: Add Zod schemas for all route request bodies and wire them into Fastify's built-in JSON Schema validation for automatic 400 responses.

**What to do**:

1. Install dependencies in the server package:
   ```bash
   cd server && npm install zod zod-to-json-schema
   ```

2. Create `server/src/routes/schemas.ts` with Zod schemas for all route bodies:
   ```typescript
   import { z } from "zod";

   const hookEventName = z.enum([
     "agentSpawn", "stop", "preToolUse", "postToolUse", "userPromptSubmit", "validation",
   ]);

   export const notifyBody = z.object({
     sessionId: z.string(),
     eventName: hookEventName.optional(),
   });

   export const viewBody = z.object({ pid: z.number() });

   export const navigateBody = z.object({ page: z.string() });

   export const renameBody = z.object({ pid: z.number(), customName: z.string() });

   export const patchSessionBody = z.object({ customName: z.string() });

   export const webhookToggleBody = z.object({ enabled: z.boolean() });

   export const assignOrphansBody = z.object({
     targetSessionId: z.string(),
     pid: z.number(),
   });
   ```
   Note: `PUT /api/config` and `PATCH /api/config` already have their own validation via `parseAndValidateConfig`. Add schemas for them too if the body shape is well-defined, or leave them as-is since they use a custom validator. Read the route to decide.

3. Create a helper to convert Zod schemas to Fastify-compatible JSON Schema:
   ```typescript
   // server/src/routes/schema-utils.ts
   import { zodToJsonSchema } from "zod-to-json-schema";
   import type { ZodType } from "zod";

   export function zodBody(schema: ZodType) {
     return { body: zodToJsonSchema(schema) };
   }
   ```

4. Update each route file to use the schemas:
   - `server/src/routes/events/events.ts`:
     - Import `{ notifyBody, viewBody, navigateBody }` from `../schemas` and `{ zodBody }` from `../schema-utils`
     - Add `{ schema: zodBody(notifyBody) }` as the route options for `POST /api/notify`
     - Add `{ schema: zodBody(viewBody) }` for `POST /api/view`
     - Add `{ schema: zodBody(navigateBody) }` for `POST /api/navigate`
     - Remove the manual `typeof sessionId !== "string"`, `typeof pid !== "number"`, `typeof page !== "string"` checks — Fastify now handles these automatically
     - Keep the business logic validation (e.g., session not found → 404)

   - `server/src/routes/sessions/sessions.ts`:
     - Add `{ schema: zodBody(patchSessionBody) }` for `PATCH /api/sessions/:id`
     - Add `{ schema: zodBody(renameBody) }` for `POST /api/rename`
     - Add `{ schema: zodBody(webhookToggleBody) }` for `POST /api/sessions/:id/webhook`
     - Remove manual `typeof` checks for `customName`, `pid`, `enabled`

   - `server/src/routes/orphans/orphans.ts`:
     - Add `{ schema: zodBody(assignOrphansBody) }` for `POST /api/orphans/assign`
     - Remove manual `!targetSessionId || typeof pid !== "number"` check

   - `server/src/routes/sessions/delete.ts`: No body to validate (uses URL params only). Skip.
   - `server/src/routes/config.ts`: Uses `parseAndValidateConfig` for custom validation. Skip or add a minimal schema that validates the body is an object.

5. Update existing route tests:
   - Tests that check `res.statusCode === 400` for missing/invalid fields should still pass since Fastify returns 400 automatically.
   - The error response body shape will change from `{ error: "sessionId required" }` to Fastify's default `{ statusCode: 400, error: "Bad Request", message: "body must have required property 'sessionId'" }`. If any tests assert on the error body text, update them.
   - Read each test file to check for body assertions. Based on my review: `events.test.ts` only checks status code. `sessions.test.ts` only checks status code. `orphans.test.ts` only checks status code. So no test body assertions need updating.
   - The `POST /api/rename` test uses `test.each` with payloads like `{ customName: "test" }` (missing pid) and `{ pid: 100 }` (missing customName). These should still get 400 from Fastify schema validation.

**Acceptance criteria**:
- Given a POST to `/api/notify` with missing `sessionId`, when the request is processed, then Fastify returns 400 automatically (before the handler runs)
- Given a POST to `/api/notify` with `eventName: "invalid"`, when the request is processed, then Fastify returns 400 (the enum validation catches invalid event names)
- Given a POST to `/api/notify` with valid `{ sessionId: "abc", eventName: "stop" }`, when the request is processed, then the handler runs normally
- Given all route handlers, when checked for manual `typeof` validation, then none remain (replaced by Zod schemas)
- All existing route tests pass: `cd server && npx vitest run`

**BDD scenarios**:

Scenario: Invalid HookEventName rejected
- Given a POST to `/api/notify` with `{ sessionId: "abc", eventName: "bogus" }`
- When Fastify processes the request
- Then it returns 400 without the handler executing

Scenario: Missing required field rejected
- Given a POST to `/api/orphans/assign` with `{ targetSessionId: "abc" }` (missing pid)
- When Fastify processes the request
- Then it returns 400

Scenario: Valid payload passes through
- Given a POST to `/api/rename` with `{ pid: 100, customName: "test" }`
- When Fastify processes the request
- Then the handler executes and processes the rename

**Done when**: Zod schemas exist for all route bodies. Fastify validates automatically. No manual `typeof` checks remain in route handlers. All route tests pass. `HookEventName` is validated at runtime.

---

### Step 8: CherrypickPage tests

**Workflow**: Moderate → ATDD + BDD

**Depends on**: Nothing

**Goal**: Write tests for the `useCherrypick` hook covering the 3-phase state machine, file parsing, selection toggling, and download.

**What to do**:

1. Read these files to understand the full feature:
   - `client/src/pages/CherrypickPage/hooks/useCherrypick.ts` — the hook under test
   - `client/src/pages/CherrypickPage/types.ts` — `PageState`, `CherrypickState`, `CherrypickActions`
   - `client/src/utils/group-exchanges.ts` — `parseConversation` (called by the hook)
   - `client/src/utils/prune-conversation.ts` — `pruneConversation` (called by the hook)
   - `client/src/types/conversation.ts` — `SavedConversation`, `ParsedConversation`, `ConversationExchange`
   - Look at existing test files for `group-exchanges.test.ts` and `prune-conversation.test.ts` to understand fixture patterns.

2. Create `client/src/pages/CherrypickPage/hooks/useCherrypick.test.ts`:
   - Use `renderHook` from `@testing-library/react` (check `client/package.json` for the exact testing library available)
   - Use `act()` to trigger state changes
   - Mock `FileReader` to simulate file upload (create a helper that triggers `onload` with test data)
   - Mock `URL.createObjectURL` and `URL.revokeObjectURL` for download tests

3. Test the following scenarios (sociable tests — use real `parseConversation` and `pruneConversation`, don't mock them):

   **Phase transitions**:
   - Initial state is `{ phase: "upload" }` with no error
   - After `handleFile` with valid JSON, state transitions to `{ phase: "edit" }` with parsed data
   - After `handlePreview`, state transitions to `{ phase: "preview" }` with pruned data
   - After `handleReset`, state returns to `{ phase: "upload" }`
   - After `goBackToEdit` from preview, state returns to `{ phase: "edit" }`

   **Error handling**:
   - `handleFile` with invalid JSON sets error "Failed to parse JSON file"
   - `handleFile` with JSON missing `history` sets error "Invalid file: missing history or conversation_id"
   - `handleFile` with JSON missing `conversation_id` sets error "Invalid file: missing history or conversation_id"

   **Selection toggling**:
   - `toggleMainId(1)` adds 1 to `deleteMainIds`, calling again removes it
   - `toggleTangentId(2)` adds 2 to `deleteTangentIds`, calling again removes it
   - `toggleAllMain(exchanges)` selects all, calling again deselects all
   - `totalSelected` reflects the sum of both sets

   **Download**:
   - `handleDownload` in preview phase creates a blob and triggers download
   - `handleDownload` outside preview phase does nothing

   Build a minimal valid `SavedConversation` fixture for tests. It needs `history` (array of message objects) and `conversation_id` (string). Look at the `parseConversation` function and its test fixtures to understand the minimum shape.

**Acceptance criteria**:
- Given the `useCherrypick` hook, when rendered, then initial state is upload phase with no error
- Given a valid conversation file, when `handleFile` is called, then state transitions to edit phase with parsed exchanges
- Given an invalid file, when `handleFile` is called, then an error message is set and phase remains upload
- Given selections in edit phase, when `handlePreview` is called, then state transitions to preview with pruned conversation
- Given preview phase, when `handleDownload` is called, then a blob download is triggered
- Given any phase, when `handleReset` is called, then state returns to upload with cleared selections

**BDD scenarios**:

Scenario: Upload valid file
- Given the hook is in upload phase
- When `handleFile` is called with a valid SavedConversation JSON file
- Then state transitions to edit phase with parsed exchanges and the file name is stored

Scenario: Upload invalid JSON
- Given the hook is in upload phase
- When `handleFile` is called with a file containing `{not valid json`
- Then error is set to "Failed to parse JSON file" and phase remains upload

Scenario: Toggle selection
- Given the hook is in edit phase with parsed exchanges
- When `toggleMainId(1)` is called
- Then `deleteMainIds` contains 1 and `totalSelected` is 1
- When `toggleMainId(1)` is called again
- Then `deleteMainIds` is empty and `totalSelected` is 0

Scenario: Preview and download
- Given the hook is in edit phase with some exchanges selected for deletion
- When `handlePreview` is called
- Then state transitions to preview phase with a pruned conversation
- When `handleDownload` is called
- Then a blob is created and a download link is triggered

Scenario: Reset clears everything
- Given the hook is in edit phase with selections
- When `handleReset` is called
- Then phase is upload, selections are empty, error is null

**Done when**: `useCherrypick.test.ts` exists with tests covering all 5 scenarios above. All tests pass: `cd client && npx vitest run`.

---

### Step 9: SkillDetailPage hook extraction

**Workflow**: Moderate → ATDD + BDD

**Depends on**: Nothing

**Goal**: Extract state management from `SkillDetailPage.tsx` into a `useSkillDetailPage` hook returning `{ state, actions }`.

**What to do**:

1. Read `client/src/pages/SkillDetailPage/SkillDetailPage.tsx` (the full file is ~170 lines).

2. Create `client/src/pages/SkillDetailPage/hooks/useSkillDetailPage.ts`:
   - Move all hooks, state, derived values, and handlers from the page component into this hook
   - The hook accepts no parameters (it reads route params internally via `useParams`, `useSearchParams`, `useNavigate`, `useLocation`)
   - Return type:
     ```typescript
     interface SkillDetailState {
       skillName: string | undefined;
       isLoading: boolean;
       error: Error | undefined;
       data: SkillDetail | undefined;  // whatever the query returns
       hasNameCollision: boolean;
       categoryOptions: Array<{ label: string; value: string }>;
       selectedCategory: string;
       showCreateModal: boolean;
       breadcrumbs: Array<{ text: string; href: string }>;
       queryString: string;
     }

     interface SkillDetailActions {
       handleCategoryChange: (newValue: string) => Promise<void>;
       handleCreateCategory: (name: string, color?: string) => Promise<void>;
       setShowCreateModal: (visible: boolean) => void;
       navigate: (href: string) => void;
     }
     ```
   - Move the redirect logic (`if (error?.message?.includes("not found"))`) into the hook. The hook can call `navigate("/skills", { replace: true })` and set a `redirecting: true` flag in state, or the page component can check `error` and handle the redirect. Prefer keeping the redirect in the hook since it's business logic.

3. Update `client/src/pages/SkillDetailPage/SkillDetailPage.tsx`:
   - Import and call `useSkillDetailPage()`
   - Destructure `{ state, actions }`
   - The component becomes a pure renderer — no `useState`, no `useParams`, no data fetching, no handlers
   - Keep the JSX structure identical

4. Create `client/src/pages/SkillDetailPage/hooks/useSkillDetailPage.test.ts`:
   - Mock the query hooks (`useSkillDetailQuery`, `useConfigQuery`, `useSkillGraphQuery`) and router hooks
   - Test derived state: `hasNameCollision`, `categoryOptions`, `selectedCategory`, `breadcrumbs`
   - Test actions: `handleCategoryChange` calls `patchConfig` with correct args, `handleCreateCategory` creates category and patches config
   - Test redirect: when error includes "not found", navigate is called

5. Verify existing test `SkillDetailPage.test.tsx` still passes. It tests the rendered page, which should work identically since the JSX didn't change.

**Acceptance criteria**:
- Given `useSkillDetailPage`, when called, then it returns `{ state, actions }` with all the state and handlers previously inline in the component
- Given the SkillDetailPage component, when rendered, then it contains no `useState`, `useParams`, `useSearchParams`, `useNavigate`, or `useLocation` calls (all delegated to the hook)
- Given the existing `SkillDetailPage.test.tsx`, when run, then all tests pass unchanged
- All client tests pass: `cd client && npx vitest run`

**BDD scenarios**:

Scenario: Derived category options
- Given config with categories `{ "frontend": { skills: ["react"] }, "backend": { skills: ["node"] } }`
- When the hook is rendered
- Then `categoryOptions` contains "Uncategorized", "frontend", "backend", and "+ Create new category"

Scenario: Name collision detection
- Given a skill graph with two nodes both named "coding-practices"
- When the hook is rendered for skill "coding-practices"
- Then `hasNameCollision` is true

Scenario: Category change
- Given the hook is rendered for skill "my-skill" with existing categories
- When `handleCategoryChange("frontend")` is called
- Then `patchConfig` is called with updated categories placing "my-skill" in "frontend"

Scenario: Not-found redirect
- Given the skill detail query returns an error containing "not found"
- When the hook is rendered
- Then `navigate("/skills", { replace: true })` is called

**Done when**: `useSkillDetailPage` hook exists. `SkillDetailPage.tsx` is a thin orchestrator with no state management. Hook tests pass. Existing page tests pass. All client tests pass.

---

### Step 10: SessionDetailPage hook extraction

**Workflow**: Moderate → ATDD + BDD

**Depends on**: Nothing

**Goal**: Extract state management from `SessionDetailPage.tsx` into a `useSessionDetailPage` hook returning `{ state, actions }`. Group `showTools` and `expandedTurns` into linked state.

**What to do**:

1. Read `client/src/pages/SessionDetailPage/SessionDetailPage.tsx` (the full file).

2. Create `client/src/pages/SessionDetailPage/hooks/useSessionDetailPage.ts`:
   - Move all hooks, state, derived values, and handlers from the page component into this hook
   - The hook accepts no parameters (reads route params via `useParams`, `useNavigate`)
   - Group `showTools` and `expandedTurns` into a single state concept since `togglePageTools` resets `expandedTurns`:
     ```typescript
     // Internal state — these are conceptually linked
     const [showTools, setShowTools] = useState(true);
     const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());
     ```
   - Return type:
     ```typescript
     interface SessionDetailState {
       id: string | undefined;
       isLoading: boolean;
       error: Error | undefined;
       session: SessionWithStatus | null;
       turns: TurnGroup[];
       webhookEnabled: boolean;
       activeSkills: string[];
       configuredSkills: string[];
       showTools: boolean;
       expandedTurns: Set<number>;
       displayName: string;
     }

     interface SessionDetailActions {
       handleRename: (name: string) => Promise<void>;
       handleToggleWebhook: () => Promise<void>;
       togglePageTools: () => void;
       toggleTurn: (turnId: number) => void;
       refresh: () => void;
       navigate: (href: string) => void;
     }
     ```

3. Update `client/src/pages/SessionDetailPage/SessionDetailPage.tsx`:
   - Import and call `useSessionDetailPage()`
   - Destructure `{ state, actions }`
   - The component becomes a pure renderer
   - Keep the JSX structure identical

4. Create `client/src/pages/SessionDetailPage/hooks/useSessionDetailPage.test.ts`:
   - Mock `useSessionQuery` and router hooks
   - Test state derivation: `displayName` falls back correctly
   - Test `togglePageTools`: resets `expandedTurns` to empty set and toggles `showTools`
   - Test `toggleTurn`: adds/removes turn IDs from `expandedTurns`
   - Test `handleRename`: calls `updateSessionName` and triggers `mutate`
   - Test `handleToggleWebhook`: calls `toggleSessionWebhook` with inverted value

5. Verify existing test `SessionDetailPage.test.tsx` still passes.

**Acceptance criteria**:
- Given `useSessionDetailPage`, when called, then it returns `{ state, actions }` with all state and handlers
- Given the SessionDetailPage component, when rendered, then it contains no `useState`, `useParams`, or `useNavigate` calls
- Given `togglePageTools` is called, when `expandedTurns` has entries, then `expandedTurns` is cleared and `showTools` is toggled
- Given the existing `SessionDetailPage.test.tsx`, when run, then all tests pass unchanged
- All client tests pass: `cd client && npx vitest run`

**BDD scenarios**:

Scenario: Toggle page tools clears expanded turns
- Given `showTools` is true and `expandedTurns` contains `{1, 3}`
- When `togglePageTools` is called
- Then `showTools` is false and `expandedTurns` is empty

Scenario: Toggle individual turn
- Given `expandedTurns` is empty
- When `toggleTurn(5)` is called
- Then `expandedTurns` contains `{5}`
- When `toggleTurn(5)` is called again
- Then `expandedTurns` is empty

Scenario: Display name fallback
- Given a session with `customName: null` and `id: "abc12345-..."`
- When the hook is rendered
- Then `displayName` is "Session abc12345"

Scenario: Display name uses custom name
- Given a session with `customName: "My Project"`
- When the hook is rendered
- Then `displayName` is "My Project"

**Done when**: `useSessionDetailPage` hook exists. `SessionDetailPage.tsx` is a thin orchestrator. Hook tests pass. Existing page tests pass. All client tests pass.

## FILES TO MODIFY/CREATE

### New files

| File | Description |
|------|-------------|
| `server/src/utils/atomic-write.ts` | Write-to-temp-then-rename utility |
| `server/src/utils/atomic-write.test.ts` | Tests for atomic write |
| `server/src/routes/schemas.ts` | Zod schemas for all route request bodies |
| `server/src/routes/schema-utils.ts` | Helper to convert Zod → Fastify JSON Schema |
| `cli/src/utils/output.ts` | `print()` and `cliLog()` functions |
| `hook-handler/src/utils/logger.ts` | Structured `log()` for hook-handler |
| `desktop/src/utils/logger.ts` | Structured `log()` for desktop |
| `client/src/pages/CherrypickPage/hooks/useCherrypick.test.ts` | Tests for useCherrypick hook |
| `client/src/pages/SkillDetailPage/hooks/useSkillDetailPage.ts` | Extracted hook |
| `client/src/pages/SkillDetailPage/hooks/useSkillDetailPage.test.ts` | Tests for extracted hook |
| `client/src/pages/SessionDetailPage/hooks/useSessionDetailPage.ts` | Extracted hook |
| `client/src/pages/SessionDetailPage/hooks/useSessionDetailPage.test.ts` | Tests for extracted hook |

### Modified files

| File | Change |
|------|--------|
| `server/src/services/storage/sessions.ts` | Use `atomicWriteFile`, add `createSessionStore` factory |
| `server/src/services/storage/lifecycle.ts` | Async `isProcessRunning`, add `createLifecycleManager` factory |
| `server/src/services/storage/lifecycle.test.ts` | Rewrite tests against factory interface, add orchestration tests |
| `server/src/services/event-bus.ts` | Add `createEventBus` factory, try/catch in `emit` |
| `server/src/services/event-bus.test.ts` | Add isolation and error-handling tests |
| `server/src/services/keep-awake.ts` | Add `createKeepAwake` factory |
| `server/src/services/log-parser/parse.ts` | Add `createLogParser` factory |
| `server/src/services/config/config.ts` | Use `atomicWriteFile` |
| `server/src/services/orphan-storage/helpers.ts` | Use `atomicWriteFile` |
| `server/src/routes/events/events.ts` | Add Zod schema validation, remove manual typeof checks |
| `server/src/routes/sessions/sessions.ts` | Await async `isProcessRunning`, add Zod schemas, remove typeof checks |
| `server/src/routes/sessions/delete.ts` | No change (params only) |
| `server/src/routes/orphans/orphans.ts` | Add Zod schema validation, remove manual typeof checks |
| `server/src/routes/config.ts` | Optionally add minimal Zod schema |
| `server/src/__tests__/mocks/services.ts` | Update `isProcessRunning` mock to async |
| `server/src/__tests__/mocks/child-process.ts` | Update to mock `execFile` instead of `execFileSync` |
| `server/src/routes/sessions/sessions.test.ts` | Update `isProcessRunning` mock calls to async |
| `server/src/routes/events/events.test.ts` | Verify tests still pass with Zod validation |
| `server/src/routes/orphans/orphans.test.ts` | Verify tests still pass with Zod validation |
| `server/package.json` | Add `zod` and `zod-to-json-schema` dependencies |
| `cli/src/commands/config.ts` | Replace `console.*` with `print()`/`cliLog()` |
| `cli/src/commands/session.ts` | Replace `console.*` with `print()`/`cliLog()` |
| `cli/src/commands/rename.ts` | Replace `console.*` with `print()`/`cliLog()` |
| `cli/src/commands/view.ts` | Replace `console.*` with `print()`/`cliLog()` |
| `cli/src/commands/sync.ts` | Replace `console.*` with `print()`/`cliLog()` |
| `cli/src/commands/toggle.ts` | Replace `console.*` with `print()`/`cliLog()` |
| `cli/src/index.ts` | Replace `console.*` with `print()`/`cliLog()` |
| `hook-handler/src/inject/run-inject/run-inject.ts` | Replace `console.*` with structured `log()` |
| `hook-handler/src/validate/exit.ts` | Replace `console.error` with structured `log()` |
| `hook-handler/src/validate/logging.ts` | Replace `.catch(() => {})` with structured error log |
| `hook-handler/src/config/test-runners/test-runners.ts` | Replace `console.error` with structured `log()` |
| `desktop/src/install-cli.ts` | Replace `console.*` with structured `log()` |
| `desktop/src/server.ts` | Replace `console.*` with structured `log()` |
| `desktop/src/main.ts` | Replace `console.error` with structured `log()` |
| `desktop/src/sse.ts` | Replace `console.error` with structured `log()` |
| `client/src/pages/SkillDetailPage/SkillDetailPage.tsx` | Thin down to orchestrator using hook |
| `client/src/pages/SessionDetailPage/SessionDetailPage.tsx` | Thin down to orchestrator using hook |

## TESTING STRATEGY

### Development workflow: per-step levels

See the table in the APPROACH section. Each step specifies its workflow level. Agents follow the plan as written without re-assessing.

### Acceptance criteria (Level 1 — ATDD)

Written out per step above in Given-When-Then format. Each step's "Acceptance criteria" section contains the criteria the agent writes tests from.

### Behavioral scenarios (Level 2 — BDD)

Written out per step above (steps 4-10) in Given-When-Then format under "BDD scenarios".

### Unit-level targets (Level 3 — TDD)

Step 5 only. The specific TDD units are:
- `startPidPolling`: PID tracking across poll cycles, `onSessionClosed` callback firing, interval management
- `cleanStaleSessions`: marker file deletion for dead PIDs, preservation for live PIDs, readdir failure handling
- `isProcessRunning`: async PID check with kiro-cli verification, dead PID handling, PID reuse detection

### Integration tests

- All existing route tests serve as integration tests (they use `Fastify.inject()` to test the full request→handler→response path)
- After step 7 (Zod validation), these tests verify that Fastify schema validation integrates correctly with the route handlers

### Verification command

After each step, the agent must run:
```bash
cd server && npx vitest run
cd client && npx vitest run
cd cli && npx vitest run
cd hook-handler && npx vitest run
```
(Only the packages modified in that step need to be tested, but running all is safe.)

## RISKS & MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Async `isProcessRunning` changes timing behavior in PID polling | Medium | Medium | The polling interval (30s) is much larger than the async overhead. Test with fake timers to verify behavior. |
| Fastify Zod validation returns different error shape than manual checks | Medium | Low | Existing tests only check status codes, not error bodies. If any downstream consumer parses error bodies, they'd need updating — but the only consumers are the React client (which checks `response.ok`) and the CLI (which checks status codes). |
| Factory refactor breaks barrel exports | Low | High | Each factory module re-exports from a default instance, so all existing `import { X } from "..."` statements continue to work. Verify by running all tests after each factory step. |
| `zod-to-json-schema` produces incompatible JSON Schema for Fastify/Ajv | Low | Medium | Test with `server.inject()` in existing route tests. If incompatible, fall back to manual `.safeParse()` in handlers. |
| CherrypickPage test fixtures don't match real conversation format | Medium | Low | Use the same fixture patterns from `group-exchanges.test.ts` and `prune-conversation.test.ts`. |

### Rollback strategy

Each step is a separate commit. If a step introduces regressions, revert that commit. The factory refactors maintain backward-compatible exports, so reverting any factory step doesn't break other steps.

### Monitoring

No production monitoring changes needed — this is a local developer tool. The structured logging changes (step 3) improve observability for debugging.

## DEPENDENCIES

- **npm packages to add**: `zod` and `zod-to-json-schema` in `server/package.json` (step 7)
- **No external systems**: All changes are local to the codebase
- **No infrastructure changes**: No config files, CI, or deployment changes
- **Step ordering**: Steps 1-3 are independent. Step 4 is independent. Step 5 depends on step 2. Step 6 depends on steps 2 and 5. Steps 7-10 are independent of each other and of steps 4-6.
