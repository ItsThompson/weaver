# Audit Brief: Over-Mocking in Tests

## Your role

You are a codebase auditor focused on: identifying tests that mock internal modules, sibling functions, or pure logic instead of only mocking true external dependencies, and flagging tests where mocks hide real bugs or assert on mock call signatures rather than observable outcomes.

## What to look for

- **Centralized mock files that mock internal services.** The codebase has shared mock setup files that blanket-mock entire service layers. Check whether these mocks replace code that could run as real implementations in tests. Key files:
  - `server/src/__tests__/mocks/services.ts` — mocks storage, log-parser, orphan-storage, skill-resolver, event-bus, webhook, skill-graph, and logger all at once
  - `server/src/__tests__/mocks/fs.ts` — mocks `node:fs` and `node:fs/promises`
  - `hook-handler/src/validate/__test-helpers__/mock-validate-deps.ts` — mocks config, changed-files, agent-tests, scope (all internal modules)
  - `shared/sync/__test-helpers__/mock-fs.ts` and `mock-os.ts`
  - `client/src/__tests__/mocks/queries.ts` and `api.ts`
- **Tests that mock sibling modules within the same bounded context.** For example, route tests that mock every service they call (storage, log-parser, skill-resolver) instead of exercising the real service code. These are in-process, deterministic modules — not external dependencies.
- **Tests that assert on mock call signatures** (`toHaveBeenCalledWith`, `toHaveBeenCalledTimes`) rather than asserting on the actual output or observable behavior of the function under test. Look for tests where the only meaningful assertion is "this mock was called with these args."
- **Pure logic tested through mocks.** Functions like config validation (`server/src/services/config/validators/`), log parsing (`server/src/services/log-parser/`), activity derivation, and skill graph building are pure transformations. If their callers mock them out, those callers' tests can't catch regressions in the real logic.
- **Mocks that return hardcoded happy-path values**, making it impossible for the test to catch bugs where the real module returns something different (shape changes, new fields, different error types).
- **Tests where removing the mock would still allow the test to pass** — indicating the mock is unnecessary overhead that reduces confidence.

## Exploration guidance

Start with the centralized mock files to understand the mocking surface area:

- `server/src/__tests__/mocks/services.ts` (mocks 8 service modules)
- `server/src/__tests__/mocks/fs.ts`
- `hook-handler/src/validate/__test-helpers__/mock-validate-deps.ts`
- `client/src/__tests__/mocks/queries.ts` and `client/src/__tests__/mocks/api.ts`

Then examine the test files that import these mocks:

- `server/src/routes/sessions/sessions.test.ts` — imports `../../__tests__/mocks/services`
- `server/src/routes/sessions/delete.test.ts`
- `server/src/routes/events/events.test.ts`
- `server/src/routes/orphans/orphans.test.ts`
- `server/src/routes/skills/skills.test.ts`
- `server/src/routes/config.test.ts`
- `hook-handler/src/validate/run-validation/run-validation.test.ts`

Compare what's mocked against what the real modules do. The real modules are:

- `server/src/services/storage/sessions.ts` and `lifecycle.ts` — file I/O (legitimate mock target)
- `server/src/services/log-parser/parse.ts`, `group-turns.ts`, `activity.ts`, `tool-calls.ts` — mostly pure transformations (questionable mock targets)
- `server/src/services/config/config.ts` — reads filesystem then validates (fs is external, validation is pure)
- `server/src/services/webhook/handler.ts` — orchestrates config read + log parse + dispatch (dispatch uses `fetch`, a legitimate mock target)

For each test file, check:

1. Does it use `vi.mocked(someModule).mockReturnValue(...)` to control internal module behavior?
2. Does it assert with `expect(someModule).toHaveBeenCalledWith(...)` instead of asserting on the response/output?
3. Could the mock be removed and the test still work (or work better) with real implementations?

Grep for `toHaveBeenCalledWith` and `toHaveBeenCalledTimes` across all test files to find assertion-on-mock patterns. Also grep for `vi.mock` to catalog the full mocking surface.

## What counts as a legitimate mock target

Only these qualify as truly external dependencies worth mocking:

- `node:fs`, `node:fs/promises` — filesystem access
- `node:child_process` — process spawning
- `globalThis.fetch` — network calls
- `node:os` (homedir) — environment-specific
- Timers (`setTimeout`, `setInterval`)

Everything else — internal services, sibling modules, pure logic, utility functions — should use real implementations in tests.

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
