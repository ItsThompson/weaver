# Audit Brief: Anti-Patterns and Code Smells

## Your role

You are a codebase auditor focused on: identifying fragile coupling between modules, god files with multiple responsibilities, nested conditionals that should be guard clauses, side-effect-heavy functions that should return values, dependencies created internally instead of injected, and patterns that make the code harder to reason about or refactor safely.

## What to look for

- **Fragile coupling between modules.** Modules that reach into each other's internals, share mutable state, or depend on import-time side effects. Specific areas to check:
  - `server/src/services/webhook/handler.ts` — maintains module-level mutable state (`pendingTimers` Map, `enabledSessions` Set) that is manipulated by exported functions. This couples any consumer to the module's internal timing state.
  - `server/src/services/storage/lifecycle.ts` — likely manages process-level state (stale session cleanup intervals, PID polling). Check if this state is properly encapsulated.
  - `server/src/services/event-bus.ts` — a pub/sub bus is a coupling vector. Check how many modules import it and whether it creates hidden dependencies between otherwise unrelated modules.
  - Shared mock files (`server/src/__tests__/mocks/services.ts`) that mock 8+ modules at once — this is a symptom of tight coupling in the production code.

- **God files with multiple responsibilities.** Files that handle parsing, validation, I/O, and orchestration all in one place. Check:
  - `server/src/services/webhook/handler.ts` — reads config, parses logs, derives activity, builds payloads, dispatches webhooks, manages timers, and tracks enabled sessions. That's at least 4 responsibilities.
  - `server/src/index.ts` — the server entry point. Check if it does more than wire up routes and start listening.
  - `hook-handler/src/validate/validate.ts` — the top-level validate orchestrator. Check its responsibility count.
  - `client/src/App.tsx` — check if routing, providers, and layout are properly separated.

- **Nested conditionals that should be guard clauses.** The codebase's own TypeScript standards require early returns over nested `if/else`. Scan for:
  - Functions with 3+ levels of nesting
  - `if/else` chains that could be flattened with early returns
  - Particularly in: `server/src/services/webhook/handler.ts` (the `handleWebhookEvent` function has nested conditionals for event types), config validation code, and route handlers

- **Side-effect-heavy functions that should return values.** Functions that mutate external state, write to files, or call APIs as their primary purpose instead of returning a result that the caller can act on. Check:
  - `server/src/services/webhook/dispatch.ts` — `dispatchWebhook` swallows errors silently (logs but doesn't propagate). The caller has no way to know if the webhook succeeded.
  - `server/src/services/event-bus.ts` — check if `broadcast`/`emit` functions return anything useful or are fire-and-forget
  - `hook-handler/src/validate/logging/logging.ts` — check if validation logging is side-effect-only

- **Dependencies created internally instead of injected.** Functions that construct their own dependencies (file paths, config readers, HTTP clients) instead of accepting them as parameters. Check:
  - `server/src/services/config/config.ts` — `CONFIG_PATH` is a module-level function that calls `homedir()`. This makes the config path untestable without mocking `node:os`.
  - `server/src/services/webhook/handler.ts` — calls `readConfig()` and `parseLogFile()` directly instead of receiving them as dependencies.
  - `hook-handler/src/validate/run-validation/run-validation.ts` — calls `homedir()` directly to build paths.
  - `server/src/services/skill-graph/discover.ts` — `GLOBAL_SKILLS_PATH` is a module-level function calling `homedir()`.

- **Import-time side effects.** Modules that execute code when imported (not just define functions/classes). The test mock files (`server/src/__tests__/mocks/*.ts`) work by being imported for their side effects (`vi.mock()` calls). Check if any production code has similar import-time side effects.

- **Stringly-typed APIs.** Functions that accept string parameters where a union type or enum would prevent bugs. Check event names, trigger types, webhook formats, and activity statuses.

## Exploration guidance

**Coupling analysis — start with the event bus:**

- `server/src/services/event-bus.ts` — read the implementation, then use find_references to see every module that imports it
- Map the dependency graph: which modules talk to each other through the bus?

**God file candidates:**

- `server/src/services/webhook/handler.ts` — already observed to have 4+ responsibilities
- `server/src/index.ts` — server entry point
- `hook-handler/src/validate/validate.ts` — top-level orchestrator
- `desktop/src/main.ts` — Electron entry point

**Guard clause violations — grep for nested patterns:**

- Search for `} else {` in `.ts` files to find `if/else` chains
- Search for deeply nested blocks in route handlers and service functions

**Dependency injection gaps:**

- Search for `homedir()` calls in production code (not test code) — each is a hardcoded dependency
- Search for `join(homedir()` to find path construction that should be injected
- Check `server/src/services/config/config.ts`, `server/src/services/storage/sessions.ts`, `server/src/services/orphan-storage/paths.ts`

**Side effects:**

- `server/src/services/webhook/dispatch.ts` — error swallowing
- `server/src/utils/logger.ts` — check if it's a pure side-effect module
- `hook-handler/src/validate/logging/logging.ts`

**Coding standards to apply (from the project's own rules):**

Guard clauses: "Prefer early returns over nested conditionals. Handle edge cases first, let main logic flow naturally."

Interface design: "Accept dependencies, don't create them. Pass external dependencies in so tests can substitute them."

Return values: "Return results, don't produce side effects. Functions that return values are simpler to assert against than functions that mutate state."

Module design: "Prefer deep modules: small interface, deep implementation."

File decomposition: "Each file should have a single responsibility."

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
