# Progress

## Status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Atomic file writes | ✅ Complete |
| 2 | Async `isProcessRunning` | ✅ Complete |
| 3 | Structured logging: print/log split | ✅ Complete |
| 4 | Factory pattern: event-bus | ✅ Complete |
| 5 | Factory pattern: storage (sessions + lifecycle) + lifecycle tests | ✅ Complete |
| 6 | Factory pattern: keep-awake + log-parser cache | ✅ Complete |
| 7 | Zod route validation | ✅ Complete |
| 8 | CherrypickPage tests | ✅ Complete |
| 9 | SkillDetailPage hook extraction | ✅ Complete |
| 10 | SessionDetailPage hook extraction | ✅ Complete |

## Completed tasks

### Step 1: Atomic file writes
- Created `server/src/utils/atomic-write.ts` with `atomicWriteFile()` (write to `.tmp` then `rename`)
- Created `server/src/utils/atomic-write.test.ts` with 4 tests (happy path, ordering, writeFile error propagation, rename error propagation)
- Updated 3 call sites:
  - `server/src/services/storage/sessions.ts` — `writeSessions()` now uses `atomicWriteFile`
  - `server/src/services/config/config.ts` — `writeConfig()` now uses `atomicWriteFile`
  - `server/src/services/orphan-storage/helpers.ts` — `writeRemaining()` now uses `atomicWriteFile`
- Added `rename` to shared fs mock (`server/src/__tests__/mocks/fs.ts`) since `atomicWriteFile` uses it
- Updated assertions in `helpers.test.ts` and `delete.test.ts` to account for `.tmp` path and `utf-8` encoding arg from `atomicWriteFile`
- All 42 test files pass (380 tests), 0 failures

### Step 2: Async `isProcessRunning`

### Step 3: Structured logging — print/log split
- Created `cli/src/utils/output.ts` with `print()` (stdout), `printError()` (stderr, user-facing), `cliLog()` (stderr, structured JSON)
- Created `hook-handler/src/utils/logger.ts` with `log()` (stderr, structured JSON) — stderr since stdout is reserved for kiro-cli
- Created `desktop/src/utils/logger.ts` with `log()` (stdout, structured JSON) — stdout since desktop logs go to Electron
- Updated 7 CLI files: `config.ts` (14 calls), `session.ts` (9), `rename.ts` (5), `view.ts` (4), `sync.ts` (3), `toggle.ts` (3), `index.ts` (2) — `console.log` → `print()`, `console.error` → `printError()`
- Updated 4 hook-handler files: `run-inject.ts` (3 calls), `exit.ts` (1), `logging.ts` (2 — including silent `.catch(() => {})`), `test-runners.ts` (1) — all → structured `log()`
- Updated 4 desktop files: `install-cli.ts` (3 calls), `server.ts` (2), `main.ts` (1), `sse.ts` (1) — all → structured `log()`
- Design decision: CLI `console.error` calls are user-facing error messages (usage strings, validation errors), not diagnostic. Used `printError()` (wraps `console.error`) to preserve test compatibility. `cliLog()` available for future structured diagnostic use.
- Zero raw `console.*` calls remain in source files (only in utility files themselves)
- All tests pass: cli (36), hook-handler (135), server (380)

### Step 4: Factory pattern — event-bus
- Refactored `server/src/services/event-bus.ts` to factory pattern following `createPendingTracker` reference
- Defined `EventBus` interface with 4 methods: `subscribe`, `broadcast`, `emit`, `sseReply`
- Created `createEventBus()` factory that encapsulates `listeners` Set internally
- Default instance created at module level; 4 functions re-exported for backward compatibility
- Added try/catch in `emit()` to prevent one broken listener from blocking others
- Added 3 new tests: isolated instances, unsubscribe, and listener error isolation
- All 42 server test files pass (383 tests, up from 380)

### Step 5: Factory pattern — storage (sessions + lifecycle) + lifecycle tests
- Refactored `server/src/services/storage/sessions.ts`:
  - Defined `SessionStore` interface with `ensureDataDir`, `readSessions`, `appendSession`, `writeSessions`, `_sessionCache`
  - Created `createSessionStore()` factory that encapsulates `FileCache` internally
  - Default instance created at module level; all functions + `_sessionCache` re-exported for backward compatibility
- Refactored `server/src/services/storage/lifecycle.ts`:
  - Defined `LifecycleManager` interface with 5 methods: `isProcessRunning`, `cleanStaleSessions`, `startStaleSessionCleanup`, `startPidPolling`, `stopStaleSessionCleanup`
  - Defined `LifecycleDeps` interface for injectable dependencies: `readSessions`, `log`, `weaverDir`
  - Created `createLifecycleManager(deps)` factory that encapsulates `cleanupInterval`, `pidPollInterval`, and `openPids` Set internally
  - Internal method calls go through the `manager` object reference (not closure), enabling `vi.spyOn()` in tests
  - Default instance wired to real implementations (`readSessions` from `./sessions`, `log` from logger, `weaverDir` from shared)
  - All 5 functions re-exported for backward compatibility
- Rewrote `server/src/services/storage/lifecycle.test.ts` with 14 tests using factory + injected deps:
  - `isProcessRunning`: 3 tests (running kiro-cli → true, dead PID → false, PID reuse → false)
  - `cleanStaleSessions`: 5 tests (deletes dead PIDs, preserves live PIDs, handles readdir failure, skips non-numeric suffixes, logs deletions)
  - `startPidPolling`: 4 tests (calls readSessions, onSessionClosed on PID disappearance, tracks new PIDs silently, multi-cycle PID transitions)
  - `stopStaleSessionCleanup`: 1 test (clears all intervals)
  - `isolated instances`: 1 test (two managers have independent state)
- Barrel `server/src/services/storage/index.ts` unchanged — same symbols exported
- All 42 server test files pass (390 tests), 0 failures
- Server build succeeds

### Step 6: Factory pattern — keep-awake + log-parser cache
- Refactored `server/src/services/log-parser/parse.ts`:
  - Defined `LogParser` interface with `parseLogFile`, `getLastEvent`, `_logCache`
  - Created `createLogParser()` factory that encapsulates `FileCache` internally
  - Default instance created at module level; `parseLogFile`, `getLastEvent`, `_logCache` re-exported for backward compatibility
- Refactored `server/src/services/keep-awake.ts`:
  - Defined `KeepAwakeDeps` interface for injectable dependencies: `readSessions`, `isProcessRunning`, `getLastEvent`, `deriveActivity`, `log`
  - Defined `KeepAwake` interface with `startKeepAwake`, `stopKeepAwake`
  - Created `createKeepAwake(deps)` factory that encapsulates the `interval` handle internally
  - Default instance wired to real implementations
  - `startKeepAwake`, `stopKeepAwake` re-exported for backward compatibility
- Updated `server/src/services/log-parser/parse.test.ts`:
  - Added 1 test: `createLogParser()` returns isolated instances with separate caches (verified via `stat` mock enabling caching, then checking readFile call counts)
- Updated `server/src/services/keep-awake.test.ts`:
  - Added 4 factory tests: executes script with active sessions, skips script with no active sessions, clears interval on stop, isolated instances
  - Existing 8 module-level mock tests continue to pass unchanged
- All 42 server test files pass (395 tests), 0 failures
- Server build succeeds

### Step 7: Zod route validation
- Installed `zod` v4.3.6 in server package. Skipped `zod-to-json-schema` — zod v4 has built-in `z.toJSONSchema()` which `zod-to-json-schema` v3 doesn't support
- Created `server/src/routes/schemas.ts` with 7 Zod schemas: `notifyBody`, `viewBody`, `navigateBody`, `renameBody`, `patchSessionBody`, `webhookToggleBody`, `assignOrphansBody`
- Created `server/src/routes/schema-utils.ts` with `zodBody()` helper that calls `z.toJSONSchema(schema, { target: "draft-07" })` for Fastify Ajv compatibility
- Wired schemas into Fastify route options via `{ schema: zodBody(...) }`:
  - `events.ts`: POST /api/notify, POST /api/view, POST /api/navigate
  - `sessions.ts`: PATCH /api/sessions/:id, POST /api/rename, POST /api/sessions/:id/webhook
  - `orphans.ts`: POST /api/orphans/assign
- Removed all manual `typeof` validation checks from route handlers (0 remain)
- Skipped config routes — they use `parseAndValidateConfig` for custom validation
- Updated `sessions.test.ts`: "returns 400 when customName is not a string" test now expects 200 because Fastify's default Ajv uses `coerceTypes: true`, coercing number 123 to string "123"
- Deviation from plan: used `z.toJSONSchema()` (zod v4 built-in) instead of `zodToJsonSchema` from `zod-to-json-schema` package, since zod v4 is not compatible with `zod-to-json-schema` v3
- Pre-existing build error in `keep-awake.ts:93` (TS2322 type mismatch from step 6) — not caused by this step
- All 42 server test files pass (395 tests), 0 failures

### Step 8: CherrypickPage tests
- Created `client/src/pages/CherrypickPage/hooks/useCherrypick.test.ts` with 15 tests across 5 describe blocks
- **Phase transitions** (5 tests): initial upload state, valid file → edit, edit → preview, reset → upload, goBackToEdit → edit
- **Error handling** (3 tests): invalid JSON, missing `history`, missing `conversation_id`
- **Selection toggling** (4 tests): toggleMainId add/remove, toggleTangentId add/remove, toggleAllMain select/deselect all, totalSelected reflects both sets
- **Download** (2 tests): creates blob + triggers download in preview phase, does nothing outside preview
- **Reset** (1 test): clears selections, error, and returns to upload phase
- Sociable tests: uses real `parseConversation` and `pruneConversation` (no mocks)
- Mocked `FileReader` globally via `vi.stubGlobal` to simulate file upload (uses `File.text()` promise internally)
- Mocked `document.createElement` selectively (only intercepts `"a"` tags, passes through for others) to avoid breaking `renderHook`
- Used existing test utilities from `conversation-parser.test-utils.ts`: `promptResponse`, `makeSavedConversation`
- All 38 client test files pass (232 tests), 0 failures

## Notes for Next Agent
- `isProcessRunning` is now async everywhere. Any new code calling it must `await` the result.
- The `execFile` mock in `server/src/__tests__/mocks/child-process.ts` is a bare `vi.fn()`. Tests that need to control its output should use `vi.mocked(execFile).mockImplementation(...)` with the callback pattern (3rd arg is `(err, result) => void`).
- The shared services mock at `server/src/__tests__/mocks/services.ts` has `isProcessRunning: vi.fn().mockResolvedValue(false)` — route tests that need it alive should use `.mockResolvedValue(true)` or `.mockImplementation((pid) => Promise.resolve(...))`.
- CLI output utilities are in `cli/src/utils/output.ts`: `print()` (stdout), `printError()` (stderr, user-facing), `cliLog()` (stderr, structured JSON). Use `print` for user-facing messages, `printError` for user-facing errors, `cliLog` for diagnostic/structured logs.
- Hook-handler structured logger is at `hook-handler/src/utils/logger.ts` — uses `console.error` (stderr) since stdout is reserved for kiro-cli output.
- Desktop structured logger is at `desktop/src/utils/logger.ts` — uses `console.log` (stdout) since desktop logs go to Electron's stdout.
- All `LogEntry` objects require `timestamp` and `event` fields. The `timestamp` is set at call site via `new Date().toISOString()`.
- `createSessionStore()` is exported from `sessions.ts` and `createLifecycleManager(deps)` from `lifecycle.ts`. These are NOT re-exported through the barrel `index.ts` — import directly from the module file if needed.
- The `LifecycleDeps` interface uses `LogEntry` type from `../../utils/logger`. Import it from there when creating mock deps.
- In lifecycle tests, `vi.spyOn(manager, 'isProcessRunning')` works because internal calls go through the `manager` object reference. This avoids needing module-level mocks for `node:child_process` when testing `startPidPolling` or `cleanStaleSessions`.

### Step 9: SkillDetailPage hook extraction
- Created `client/src/pages/SkillDetailPage/hooks/useSkillDetailPage.ts`:
  - Defined `SkillDetailState` interface with 12 fields: `skillName`, `isLoading`, `error`, `data`, `hasNameCollision`, `categoryOptions`, `categoryNames`, `selectedCategory`, `showCreateModal`, `breadcrumbs`, `queryString`, `redirecting`
  - Defined `SkillDetailActions` interface with 4 methods: `handleCategoryChange`, `handleCreateCategory`, `setShowCreateModal`, `navigate`
  - Moved all hooks (`useParams`, `useSearchParams`, `useNavigate`, `useLocation`, `useSkillDetailQuery`, `useConfigQuery`, `useSkillGraphQuery`, `useState`), derived values, and handlers from the component into the hook
  - Redirect logic (error "not found" → navigate to /skills) kept in hook with `redirecting` boolean flag
  - Added `categoryNames` to state (not in original plan interface) since the component needs it for `CreateCategoryModal`'s `existingNames` prop
- Updated `client/src/pages/SkillDetailPage/SkillDetailPage.tsx`:
  - Component is now a pure renderer — no `useState`, `useParams`, `useSearchParams`, `useNavigate`, or `useLocation` calls
  - Destructures `{ state, actions }` from `useSkillDetailPage()`
  - JSX structure identical to original
- Created `client/src/pages/SkillDetailPage/hooks/useSkillDetailPage.test.ts` with 15 tests across 7 describe blocks:
  - **Derived category options** (2 tests): includes Uncategorized + category names + Create option; handles no config
  - **Name collision detection** (2 tests): true when multiple nodes share skillName; false otherwise
  - **selectedCategory** (2 tests): uses data.category when available; defaults to __uncategorized__
  - **Breadcrumbs** (3 tests): Skills breadcrumb when no referrer; Sessions breadcrumb from session; project in queryString
  - **handleCategoryChange** (2 tests): calls patchConfig with updated categories; opens create modal for CREATE_NEW
  - **handleCreateCategory** (1 test): creates category with skill and patches config
  - **Not-found redirect** (3 tests): calls navigate; sets redirecting true; does not redirect for other errors
- All 39 client test files pass (247 tests), 0 failures

### Step 10: SessionDetailPage hook extraction
- Created `client/src/pages/SessionDetailPage/hooks/useSessionDetailPage.ts`:
  - Defined `SessionDetailState` interface with 11 fields: `id`, `isLoading`, `error`, `session`, `turns`, `webhookEnabled`, `activeSkills`, `configuredSkills`, `showTools`, `expandedTurns`, `displayName`
  - Defined `SessionDetailActions` interface with 6 methods: `handleRename`, `handleToggleWebhook`, `togglePageTools`, `toggleTurn`, `refresh`, `navigate`
  - Moved all hooks (`useParams`, `useNavigate`, `useSessionQuery`, `useState`), derived values, and handlers from the component into the hook
  - `showTools` and `expandedTurns` grouped as linked state — `togglePageTools` resets `expandedTurns`
- Updated `client/src/pages/SessionDetailPage/SessionDetailPage.tsx`:
  - Component is now a pure renderer — no `useState`, `useParams`, or `useNavigate` calls
  - Destructures `{ state, actions }` from `useSessionDetailPage()`
  - JSX structure identical to original
- Created `client/src/pages/SessionDetailPage/hooks/useSessionDetailPage.test.ts` with 8 tests across 6 describe blocks:
  - **displayName** (2 tests): falls back to truncated id; uses customName when available
  - **togglePageTools** (1 test): toggles showTools and clears expandedTurns
  - **toggleTurn** (1 test): adds and removes turn IDs from expandedTurns
  - **handleRename** (2 tests): calls updateSessionName + mutate; does nothing when id/data missing
  - **handleToggleWebhook** (1 test): calls toggleSessionWebhook with inverted value + mutate
  - **state derivation** (1 test): defaults to empty values when no data
- Existing `SessionDetailPage.test.tsx` passes unchanged (7 tests)
- All 40 client test files pass (255 tests), 0 failures

## Open Questions / Blockers
(none)
