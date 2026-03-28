# Audit Report: Coding Standards and Best Practices

### Summary

The codebase shows strong adherence to several standards — no default exports in the client, good use of `reduce` in many places, and well-structured route handlers. However, there are systemic violations in three areas: raw `console.log`/`console.error` calls throughout `hook-handler/`, `cli/`, and `desktop/` (47+ occurrences bypassing the structured `log()` function), widespread terse single-letter callback parameters across both server and client code, and types defined inline in implementation files rather than dedicated `types.ts` files. For-loop usage is present in 7 non-test source files, and module-level `process.env` reads and client instantiations appear in several backend entry points.

### Findings

---

- **Area**: `hook-handler/src/`, `cli/src/`, `desktop/src/`, `shared/sync/`
- **Observation**: 47+ raw `console.log`, `console.error`, and `console.warn` calls bypass the structured `log()` function defined in `server/src/utils/logger.ts`. The server itself is clean (only `logger.ts` calls `console.log`), but every other backend package uses ad-hoc console calls with string interpolation:
  - `hook-handler/src/inject/run-inject/run-inject.ts:26` — `console.error("Failed to parse pending file:", path, e)`
  - `hook-handler/src/validate/exit.ts:22` — `console.error("Failed to write pending file:", path, e)`
  - `hook-handler/src/validate/logging.ts:25` — `console.error("Failed to write validation event:", ...)`
  - `hook-handler/src/config/test-runners/test-runners.ts:36` — `console.error("Failed to parse ~/.weaver/config.json:", e)`
  - `cli/src/commands/config.ts` — 14 raw console calls
  - `cli/src/commands/session.ts` — 9 raw console calls
  - `cli/src/commands/rename.ts`, `view.ts`, `sync.ts`, `toggle.ts` — 3-5 each
  - `desktop/src/install-cli.ts` — `console.log`, `console.warn` (lines 48, 52, 54)
  - `desktop/src/server.ts` — `console.log`, `console.error` (lines 23, 39)
  - `desktop/src/main.ts:33` — `console.error("Could not connect to server")`
  - `desktop/src/sse.ts:23` — `console.error("Failed to parse SSE data:", e)`
  - `shared/sync/validation.ts:14` — `console.error("weaver: invalid ${label}, skipping")`
- **Impact**: Unstructured log output makes it impossible to parse logs programmatically, filter by event type, or correlate errors across packages. The `hook-handler` errors are especially problematic since they run in subprocess contexts where structured output would aid debugging.
- **Suggestion**: Extend the shared `log()` function (or create a package-level equivalent) to `hook-handler`, `cli`, and `desktop`. For `cli` user-facing output, distinguish between structured logging (for machine consumption) and user messages (for human consumption) with separate functions.
- **Severity**: High

---

- **Area**: `server/src/routes/`, `server/src/routes/events/events.ts`, `server/src/routes/orphans/orphans.ts`, `server/src/routes/config.ts`
- **Observation**: Server route handlers validate request bodies with manual `typeof` checks instead of Zod schemas. The backend standard requires "Zod for external data validation" but Zod is only used in `shared/sync/` for `.weaver.json` project config parsing. Examples:
  - `server/src/routes/sessions/sessions.ts:97` — `if (typeof customName !== "string")`
  - `server/src/routes/events/events.ts:17` — `if (typeof sessionId !== "string")`
  - `server/src/routes/orphans/orphans.ts:31` — `if (!targetSessionId || typeof pid !== "number")`
  - `server/src/routes/config.ts:24` — passes raw `request.body` through `JSON.stringify` then custom `parseAndValidateConfig` instead of a Zod schema
  - `server/src/routes/events/events.ts:12` — TypeScript generic `Body: { sessionId: string; eventName?: HookEventName }` provides no runtime validation; the comment on line 11 even acknowledges this: "Fastify does not validate the incoming JSON against the union at runtime"
- **Impact**: Manual validation is error-prone and inconsistent. The `HookEventName` union is not validated at runtime, meaning any string passes through as an event name. Missing fields produce unclear errors rather than structured validation messages.
- **Suggestion**: Define Zod schemas for each route's request body (e.g., `notifyBodySchema`, `assignOrphansBodySchema`) and validate with `.safeParse()` at the top of each handler. The existing `shared/sync/schemas.ts` pattern is a good model.
- **Severity**: High

---

- **Area**: 15+ source files across all packages
- **Observation**: Terse single-letter callback parameters are widespread, violating the "verbose naming" standard. The most common offender is `(s) =>` for sessions, appearing in nearly every route file:
  - `server/src/routes/sessions/sessions.ts` — `sessions.map(async (s) => {` (line 35), `sessions.find((s) => s.id === id)` (line 58), `sessions.findIndex((s) => s.id === id)` (line 99), `sessions.findLastIndex((s) => s.pid === pid)` (line 123), `sessions.some((s) => s.id === id)` (line 146)
  - `server/src/routes/events/events.ts` — `sessions.find((s) => s.id === sessionId)` (line 21), `sessions.filter((s) => s.pid === pid)` (line 49)
  - `server/src/routes/orphans/orphans.ts` — `sessions.find((s) => s.id === targetSessionId)` (line 35), `allSessions.findIndex((s) => s.id === targetSessionId)` (line 52)
  - `hook-handler/src/scope/scope.ts` — `(f) =>` (line 12), `(d) =>` (line 15), `(a) =>` (line 15), `(k) =>` (line 54)
  - `hook-handler/src/session-analysis/session-analysis.ts` — `(l) =>` (line 19)
  - `hook-handler/src/validate/glob.ts` — `(f) =>` (lines 15, 19)
  - `hook-handler/src/validate/run-validation/post-tool-use-trigger.ts` — `(h) =>` (line 21)
  - `client/src/components/CommandPalette/CommandPalette.tsx` — `(o) =>` (line 70), `(v) =>` (line 112)
  - `client/src/pages/SessionsPage/SessionsPage.tsx` — `(s) =>` (lines 29, 30)
  - `client/src/context/NotificationContext/NotificationContext.tsx` — `(n) =>` (line 44)
  - `client/src/components/ActionDropdown/ActionDropdown.tsx` — `(a) =>` (line 22)
  - `client/src/hooks/notifications/soundUtils.ts` — `(t) =>` (line 24)
  - `server/src/services/config/validators/field.ts` — `(v) =>` (line 27)
  - `server/src/services/storage/lifecycle.ts` — `(f) =>` (line 42), `(s) =>` (line 93)
- **Impact**: Reduces readability, especially when the callback body is non-trivial. `(s) => s.id === id` requires the reader to infer that `s` is a session from context. In `scope.ts`, `(d) => !agentTestedDirs.some((a) => d === a || d.startsWith(a + "/"))` has two single-letter variables interacting, making the logic harder to follow.
- **Suggestion**: Rename to descriptive names: `(session) =>`, `(file) =>`, `(dir) =>`, `(hook) =>`, `(option) =>`, `(notification) =>`, etc.
- **Severity**: Medium

---

- **Area**: 7 non-test source files
- **Observation**: `for` loops are used instead of functional iteration methods:
  - `server/src/services/log-parser/group-turns.ts:42` — `for (const event of events)` with `continue` and a `flushTurn()` side-effect pattern
  - `server/src/services/log-parser/tool-calls.ts:7` — `for (const event of events)` with a mutable `pending` Map
  - `server/src/services/keep-awake.ts:13` — `for (const s of sessions)` with early `return true`
  - `client/src/utils/group-exchanges.ts:52` — `for (let i = 0; i < history.length; i++)` with mutable `current` accumulator
  - `client/src/hooks/notifications/soundUtils.ts` — 5 for-loops (lines 12, 27, 28, 39, 58) for audio sample generation
  - `hook-handler/src/validate/run-validation/parse-args.ts:11` — `for (let i = 2; i < argv.length; i += 2)` stepping by 2
  - `server/src/services/skill-graph/get-skill-detail.ts:59` — `for (const candidate of filtered)` with async/await and early return
- **Impact**: Inconsistency with the functional iteration standard. Some cases (like `group-turns.ts` and `tool-calls.ts`) involve complex stateful accumulation where `reduce` would be awkward but possible. The `soundUtils.ts` loops are performance-sensitive DSP code where for-loops are arguably the right choice. The `keep-awake.ts` early-return pattern could use `Array.some()`.
- **Suggestion**: Convert `keep-awake.ts` to use `sessions.some()` (or an async equivalent). Convert `parse-args.ts` to use `Array.from({ length })` or `reduce` over paired chunks. Accept the `group-turns.ts` and `soundUtils.ts` loops as pragmatic exceptions but document the rationale.
- **Severity**: Medium

---

- **Area**: `server/src/index.ts`, `cli/src/utils.ts`, `cli/src/index.ts`, `desktop/src/server.ts`
- **Observation**: Module-level `process.env` reads and client instantiations violate the backend standard:
  - `server/src/index.ts:48` — `process.env.WEAVER_CLIENT_DIST || resolve(...)` evaluated at module load, not wrapped in a lazy function
  - `server/src/index.ts:27` — `const server = Fastify()` instantiated at module level
  - `cli/src/utils.ts:3` — `const WEAVER_SERVER = process.env.WEAVER_SERVER ?? "http://localhost:8143"` read at module level
  - `cli/src/index.ts:10-12` — `process.argv` parsed at module level
  - `desktop/src/server.ts:10-12` — `app.isPackaged` and `process.resourcesPath` evaluated at module level to compute `resourcesPath`
- **Impact**: Module-level env reads make testing harder (must set env vars before import), prevent lazy initialization, and create hidden coupling to the environment. The `server/src/index.ts` Fastify instance being module-level means the server is created on import, not on explicit startup.
- **Suggestion**: Wrap env reads in lazy arrow functions per the standard: `const WEAVER_SERVER = () => process.env.WEAVER_SERVER ?? "http://localhost:8143"`. Move the Fastify instantiation inside the `start()` function. For `cli/src/index.ts`, the module-level argv parsing is acceptable for a CLI entry point but could be wrapped in a `main()` function.
- **Severity**: Medium

---

- **Area**: 15+ implementation files across all packages
- **Observation**: Types and interfaces are defined inline in implementation files rather than in dedicated `types.ts` files. While some packages have `types.ts` files (e.g., `shared/types/`, `client/src/types/`, `client/src/pages/CherrypickPage/types.ts`), many modules define types alongside implementation:
  - `server/src/services/event-bus.ts` — `SSETarget`, `SSEMessage`, `Listener` (lines 3, 11, 16)
  - `server/src/services/config/validators/field.ts` — `ValidatorResult`, `FieldValidator` (lines 7-8)
  - `server/src/services/skill-graph/get-skill-detail.ts` — `CandidatePath` (line 16)
  - `server/src/services/file-cache/file-cache.ts` — `CacheEntry<T>` (line 4)
  - `server/src/services/orphan-storage/helpers.ts` — `PartitionResult` (line 8)
  - `hook-handler/src/validate/exit.ts` — `ValidateResult` (line 5)
  - `hook-handler/src/validate/run-validation/parse-args.ts` — `ValidateArgs` (line 1)
  - `hook-handler/src/inject/formatting.ts` — `PendingFile` (line 4)
  - `hook-handler/src/config/find-config/find-config.ts` — `ConfigMatch` (line 5)
  - `client/src/context/NotificationContext/NotificationContext.tsx` — `Notification`, `NotificationContextValue` (lines 18, 25)
  - `client/src/context/ActivityLogContext/ActivityLogContext.tsx` — `ActivityLogEntry`, `ActivityLogContextValue` (lines 19, 26)
  - `client/src/components/ActionDropdown/ActionDropdown.tsx` — `ActionItem`, `ActionDropdownProps` (lines 5, 11)
  - `client/src/pages/SettingsPage/hooks/useSettings.ts` — `SettingsState`, `SettingsActions` (lines 6, 14)
  - `client/src/pages/OrphansPage/hooks/useOrphansPage.ts` — `OrphansPageState` (line 14)
  - `client/src/hooks/notifications/soundUtils.ts` — `NotificationSound` (line 1)
- **Impact**: Mixing types with implementation makes it harder to import types without pulling in implementation dependencies. It also makes the module's public API less discoverable — consumers must read the implementation to find available types.
- **Suggestion**: Extract exported types to sibling `types.ts` files. Private types (like `CacheEntry<T>` or `CandidatePath`) used only within a single file can remain inline. Focus extraction on types that are re-exported through `index.ts` barrels.
- **Severity**: Medium

---

- **Area**: `shared/types/session.ts`, `shared/types/events.ts`, `shared/types/validation.ts`, `shared/types/config.ts`
- **Observation**: String literal unions are used for fixed sets that are referenced across multiple files, where the standard calls for enums with PascalCase names and UPPER_SNAKE_CASE keys:
  - `ActivityStatus = "starting" | "idle" | "processing" | "running_tool" | "pending_approval"` — used in `session.ts`, `event-bus.ts`, `handler.ts`, `payload-simple.ts`, `colors.ts`, `notificationUtils.ts`, `ActivityLogContext.tsx`
  - `HookEventName = "agentSpawn" | "stop" | "preToolUse" | "postToolUse" | "userPromptSubmit" | "validation"` — used across server routes, webhook handler, log parser, event bus, client contexts
  - `"stop" | "postToolUse"` trigger type — used in `validation.ts`, `exit.ts`, `logging.ts`, `run-validation/`
  - `"simple" | "advanced"` webhook format — used in `config.ts`, `handler.ts`
  - `"global" | "workspace"` skill source — used in `skills.ts`, `get-skill-detail.ts`, `SkillNode.tsx`
- **Impact**: String literal unions provide no runtime representation, making it impossible to iterate over valid values, use them in switch exhaustiveness checks with a default case, or validate incoming strings against the set. Enums would provide both compile-time and runtime safety.
- **Suggestion**: Convert `ActivityStatus` and `HookEventName` to enums first, as they have the widest cross-package usage. E.g., `enum ActivityStatus { STARTING = "starting", IDLE = "idle", ... }`.
- **Severity**: Medium

---

- **Area**: `server/src/services/storage/lifecycle.ts`, `server/src/services/event-bus.ts`, `server/src/services/keep-awake.ts`, `client/src/hooks/notifications/soundUtils.ts`
- **Observation**: Module-level mutable state and eager computation:
  - `lifecycle.ts:11-14` — `let cleanupInterval`, `let pidPollInterval`, `const openPids = new Set<number>()` — three pieces of module-level mutable state
  - `event-bus.ts:19` — `const listeners = new Set<Listener>()` — module-level mutable singleton
  - `keep-awake.ts:9` — `let interval` — module-level mutable state
  - `soundUtils.ts:73-82` — `const SOUND_URLS` eagerly calls `samplesToWavUrl(generateTone(...))` at import time, performing audio computation and creating Blob URLs even if notifications are never used
- **Impact**: Module-level mutable state makes these modules effectively singletons that are hard to test in isolation and impossible to reset between tests without reaching into internals. The eager `SOUND_URLS` computation wastes resources on pages that never play sounds.
- **Suggestion**: Use the lazy singleton pattern: `let _instance: T | null = null; const getInstance = () => _instance ??= create()`. For `SOUND_URLS`, compute lazily on first `playNotificationSound` call.
- **Severity**: Medium

---

- **Area**: `client/src/pages/SkillGraphPage/components/SkillNode.tsx`
- **Observation**: Hardcoded color value outside the design system:
  - Line 9: `const WORKSPACE_BG = "#1a2332"` — a hex color defined directly in the component, not sourced from `client/src/theme/colors.ts`
  - The component does reference `colors.backgroundContainer` and `colors.textPrimary` from the theme for other values, making the inconsistency more visible
- **Impact**: If the theme changes, this color won't update. It also creates a maintenance burden — developers must check both `colors.ts` and individual components for color definitions.
- **Suggestion**: Add `workspaceBackground` to `client/src/theme/colors.ts` and import it.
- **Severity**: Low

---

- **Area**: `client/src/pages/MiniPage/MiniPage.tsx`, `client/src/pages/SettingsPage/SettingsPage.tsx`, `client/src/pages/SkillGraphPage/components/SkillNode.tsx`
- **Observation**: Import ordering violations — the standard requires React → external libraries → internal modules → local files:
  - `MiniPage.tsx:1-6` — `react-router-dom` imported before `react` (line 1 vs line 2)
  - `SettingsPage.tsx:1-17` — Cloudscape imports come first with no React import at all (React is used implicitly via JSX transform)
  - `SkillNode.tsx:1-5` — `@xyflow/react` imported first (lines 1-2), then types (line 3), then theme (line 4), then `react-router-dom` (line 5). React-ecosystem imports (`react-router-dom`) should precede other external libraries
- **Impact**: Inconsistent import ordering reduces scanability and makes it harder to quickly identify a file's dependencies. Automated formatters can't enforce semantic ordering without configuration.
- **Suggestion**: Add an ESLint import ordering rule (e.g., `eslint-plugin-import` with `import/order`) to enforce the React → external → internal → local convention automatically.
- **Severity**: Low

---

- **Area**: `client/src/hooks/notifications/soundUtils.ts`, `hook-handler/src/validate/logging.ts`, `client/src/context/ActivityLogContext/ActivityLogContext.tsx`
- **Observation**: Errors are silently swallowed without logging or user notification:
  - `soundUtils.ts:83` — `new Audio(SOUND_URLS[sound]).play().catch(() => {})` — audio playback failures are completely ignored
  - `logging.ts:34` — `.catch(() => {})` on the fire-and-forget `fetch` to the server notification endpoint
  - `ActivityLogContext.tsx:82` — `catch { /* ignore */ }` on SSE event JSON parsing
- **Impact**: The frontend standard requires "combine user notifications with error tracking; never silently swallow errors." While some of these are intentionally fire-and-forget (the `logging.ts` fetch), the `soundUtils.ts` case could indicate a browser autoplay policy issue that the user should know about, and the SSE parse error could indicate a protocol mismatch.
- **Suggestion**: At minimum, add `console.warn` or a debug-level log for these catch blocks. For `soundUtils.ts`, consider tracking whether audio playback is blocked by autoplay policy and surfacing it once.
- **Severity**: Low

---

- **Area**: `client/src/pages/SessionsPage/components/ActionsCell.tsx`, `client/src/pages/OrphansPage/hooks/useOrphansPage.ts`
- **Observation**: Multiple `useState` calls manage state that represents mutually exclusive UI modes or could be grouped:
  - `ActionsCell.tsx:17-19` — `renameVisible`, `deleteVisible`, `deleting` are three separate booleans. `renameVisible` and `deleteVisible` are mutually exclusive (you can't have both modals open). `deleting` is only meaningful when `deleteVisible` is true. This creates impossible states like `{ renameVisible: true, deleteVisible: true }`.
  - `useOrphansPage.ts:39-41` — `assigning` (a pid or null) and `deleting` (boolean) represent mutually exclusive operations but are tracked independently, allowing `{ assigning: 42, deleting: true }`.
- **Impact**: Impossible states lead to subtle bugs. If both modals could theoretically be set visible simultaneously, the UI behavior is undefined. The standard recommends "eliminate impossible states" by collapsing into single status variables.
- **Suggestion**: Replace with a discriminated union: `type ModalState = { mode: "idle" } | { mode: "rename" } | { mode: "delete"; deleting: boolean }`. For `useOrphansPage`, use `type AsyncOp = { type: "idle" } | { type: "assigning"; pid: number } | { type: "deleting" }`.
- **Severity**: Low

---

- **Area**: `client/src/pages/MiniPage/MiniPage.tsx`
- **Observation**: Extensive inline styles with hardcoded values instead of theme tokens:
  - Lines 53-56: `fontFamily: "'Open Sans', sans-serif"` — hardcoded font family
  - Lines 60-68: `height: 28`, `zIndex: 9999` — hardcoded layout values
  - Lines 72-76: `padding: "16px 12px"`, `fontSize: 13` — hardcoded spacing and font sizes
  - Lines 81-86: `gap: 8`, `padding: "8px 12px"`, `fontSize: 13` — repeated hardcoded values
  - The same `height: 28` drag region pattern with identical inline styles also appears in `App.tsx:72-80`
- **Impact**: Hardcoded values bypass the design system, making global theme changes ineffective for these components. The duplicated drag region styles violate DRY.
- **Suggestion**: Extract the drag region into a shared component. Move repeated spacing/font values into the theme or CSS variables.
- **Severity**: Low

### Deepening Candidates

- **Cluster**: `server/src/services/event-bus.ts` + `server/src/services/webhook/handler.ts` + `server/src/services/webhook/session-tracker.ts`
- **Why they're coupled**: The event bus broadcasts session events, the webhook handler subscribes to the same events via the `/api/notify` route, and the session tracker gates webhook delivery per-session. All three share `HookEventName` and `sessionId` as core concepts. The `handleWebhookEvent` function is only called from `events.ts` route, making the route → webhook path a single pipeline that's split across three modules.
- **Dependency category**: In-process
- **Test impact**: `event-bus.test.ts` and `webhook-*.test.ts` could be replaced by boundary tests that POST to `/api/notify` and assert on outbound HTTP calls (webhook dispatch) and SSE messages (event bus).

---

- **Cluster**: `server/src/services/storage/lifecycle.ts` + `server/src/services/storage/sessions.ts` + `server/src/services/keep-awake.ts`
- **Why they're coupled**: All three manage session lifecycle state. `lifecycle.ts` polls PIDs and cleans stale sessions using `readSessions()` from `sessions.ts`. `keep-awake.ts` also calls `readSessions()` and `isProcessRunning()` from `lifecycle.ts`. They share the `Session` type and the concept of "is this PID alive." The module-level mutable state (`openPids`, `cleanupInterval`, `pidPollInterval`, `interval`) across these files represents a single lifecycle management concern split into three files.
- **Dependency category**: In-process (with local filesystem for session data)
- **Test impact**: `lifecycle.test.ts` and `keep-awake.test.ts` both mock `readSessions` and `isProcessRunning`. A unified module could be tested through a single interface that manages session liveness, with the filesystem as the only external boundary.

---

- **Cluster**: `hook-handler/src/validate/exit.ts` + `hook-handler/src/validate/logging.ts` + `hook-handler/src/validate/commands.ts`
- **Why they're coupled**: These three files form the core validation execution pipeline. `commands.ts` runs a shell command and returns output. `logging.ts` writes the validation event to the session log. `exit.ts` decides the exit code and writes the pending file. They share `ValidationResult` and `sessionId`, and are always called together in sequence by the trigger functions (`stop-trigger.ts`, `post-tool-use-trigger.ts`). Each file is shallow — `exit.ts` is 31 lines, `logging.ts` is 35 lines, `commands.ts` is 48 lines.
- **Dependency category**: In-process (with local filesystem for pending files and session logs)
- **Test impact**: `exit.test.ts`, `logging.test.ts`, and `commands.test.ts` could be replaced by boundary tests on the trigger functions that assert on filesystem output (pending files, log entries) and exit codes.

### Metrics

- Files examined: 51
- Findings: 13 (2 high, 6 medium, 5 low)
- Deepening candidates: 3
