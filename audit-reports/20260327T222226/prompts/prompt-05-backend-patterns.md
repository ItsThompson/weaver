# Audit Brief: Backend Patterns and Anti-Patterns

## Your role

You are a codebase auditor focused on: evaluating the server and hook-handler packages for backend design quality, including route handler thickness, service decomposition, error handling, data access patterns, and process management.

## What to look for

- **Route handler thickness**: The standard requires thin handlers that parse input, log, delegate to services, and handle errors. Check whether `server/src/routes/` handlers contain business logic that should be in services. Key routes: `sessions/sessions.ts` (140+ lines, multiple endpoints), `events/events.ts`, `orphans/orphans.ts`, `config.ts`, `skills/skills.ts`.
- **Error handling consistency**: Check whether all route handlers have consistent error responses. Look for: missing error handling in async operations, inconsistent error response shapes, swallowed errors (empty `catch` blocks), and whether the global error handler in `server/src/index.ts` catches everything.
- **Process management safety**: `server/src/services/storage/lifecycle.ts` uses `process.kill(pid, 0)` and `execFileSync("ps", ...)` for PID checking. Assess: race conditions between check and action, error handling for edge cases (permission denied, zombie processes), and whether `execFileSync` is safe (blocks the event loop).
- **Filesystem access patterns**: Multiple modules read/write to `~/.weaver/`. Check for: race conditions in concurrent reads/writes to `sessions.jsonl`, atomic write patterns (write-to-temp-then-rename vs direct write), and error handling for missing/corrupt files. Key files: `server/src/services/storage/sessions.ts`, `server/src/services/orphan-storage/`, `shared/sync/patch-agent-config.ts`.
- **Webhook system design**: `server/src/services/webhook/` has 8+ files (handler, dispatch, pending-tracker, session-tracker, context, payload-simple, payload-advanced, types). Assess whether this decomposition is appropriate or over-fragmented. Check the handler's error handling and retry logic.
- **Hook-handler CLI design**: `hook-handler/src/validate/` and `hook-handler/src/inject/` are CLI entry points that run as child processes. Check: exit code handling, stderr/stdout usage, argument parsing robustness, and whether they handle unexpected input gracefully.
- **Synchronous filesystem operations**: `shared/sync/sync.ts` uses `readdirSync` and `existsSync`. `server/src/services/storage/lifecycle.ts` uses `execFileSync`. Assess whether synchronous operations block the event loop in contexts where async alternatives should be used.
- **Service initialization order**: The server starts multiple background services (stale session cleanup, PID polling, keep-awake). Check whether the startup order matters and whether failures in one service affect others.

## Exploration guidance

Start with the server's service layer:

- `server/src/services/storage/lifecycle.ts` — PID management, interval timers, `execFileSync`.
- `server/src/services/storage/sessions.ts` — session CRUD, filesystem access.
- `server/src/services/event-bus.ts` — SSE pub/sub.
- `server/src/services/keep-awake.ts` — background process management.
- `server/src/services/webhook/handler.ts` — webhook orchestration.
- `server/src/services/webhook/dispatch.ts` — HTTP dispatch.
- `server/src/services/webhook/pending-tracker.ts` — tracks pending webhooks.

Then review route handlers:

- `server/src/routes/sessions/sessions.ts` — the largest route file, multiple endpoints.
- `server/src/routes/events/events.ts` — event ingestion, likely the hottest path.
- `server/src/routes/orphans/orphans.ts` — orphan event management.
- `server/src/routes/config.ts` — config CRUD.

Then review hook-handler:

- `hook-handler/src/validate/run-validation/run-validation.ts` — validation orchestration.
- `hook-handler/src/validate/stop-hook/stop-hook.ts` — stop hook logic.
- `hook-handler/src/validate/commands.ts` — command execution.
- `hook-handler/src/validate/exit.ts` — exit code handling.
- `hook-handler/src/inject/run-inject/run-inject.ts` — injection logic.
- `hook-handler/src/session-analysis/session-analysis.ts` — session log analysis.
- `hook-handler/src/scope/scope.ts` — scope resolution.

For filesystem safety, grep for:

- `writeFileSync` and `writeFile` — check for atomic write patterns.
- `readFileSync` and `readFile` — check for error handling on missing/corrupt files.
- `unlinkSync` and `unlink` — check for TOCTOU race conditions.

For error handling, grep for:

- Empty `catch` blocks: `catch {` or `catch (` followed by `}`
- `catch` blocks that only log but don't propagate or handle

## Report format

Write your report as a markdown file with this structure:

### Summary

2-3 sentence overview of what you found.

### Findings

For each finding, include:

- **Area**: Which modules/files are involved
- **Observation**: What you found (be specific: quote code, name files, show structure)
- **Impact**: Why this matters (testability, maintainability, coupling, correctness)
- **Suggestion**: What could be improved (directional, not a full design)
- **Severity**: High / Medium / Low

Order findings by severity (high first).

### Deepening Candidates

If you identified modules that would benefit from deepening (merging shallow modules into a deep module with a small interface hiding complex implementation), list them here:

- **Cluster**: Which modules/concepts are involved
- **Why they're coupled**: Shared types, call patterns, co-ownership of a concept
- **Dependency category**: In-process / Local-substitutable / Remote but owned / True external
- **Test impact**: What existing tests would be replaced by boundary tests

### Metrics

- Files examined: N
- Findings: N (H high, M medium, L low)
- Deepening candidates: N
