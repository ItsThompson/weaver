# Audit Brief: Testability Gaps

## Your role

You are a codebase auditor focused on: identifying untested code, weak tests, over-mocked tests, and modules whose design makes them hard to test.

## What to look for

- **Untested packages**: The `desktop/` package has zero unit test files. Assess which modules in `desktop/src/` (window.ts, tray.ts, server.ts, sse.ts, config.ts, install-cli.ts) contain testable logic that should have tests vs pure Electron glue that's hard to unit test.
- **Client test coverage gaps**: The client has ~10 test files but many more components, pages, hooks, and contexts. Identify which client modules lack tests entirely. Pay special attention to: pages (`SessionsPage`, `SessionDetailPage`, `CherrypickPage`, `OrphansPage`, `MiniPage`), contexts (`WindowContext`, `NotificationContext`, `ActivityLogContext`), and hooks (`useSessionNotifications`, `useSessionEvents`, `useWindowList`, `useNavigateOnView`).
- **Over-mocked tests**: Look for tests that mock internal collaborators instead of testing through the public interface. The testing standard is "sociable tests by default" — only mock truly external dependencies (network, filesystem, timers). Check whether server route tests mock internal services unnecessarily.
- **Weakened assertions**: Look for tests that assert only on trivial things (e.g., "component renders", "function was called") instead of meaningful behavior. Check if any tests were weakened to pass rather than fixing the underlying issue.
- **Module-level state testability**: `server/src/services/storage/lifecycle.ts` uses module-level `Set`s and `setInterval`. `server/src/services/event-bus.ts` uses a module-level `Set<Listener>`. Assess whether these are tested properly and whether the module-level state leaks between tests.
- **CLI test coverage**: `cli/src/commands.test.ts` is the only test file for the CLI. Check whether it covers all 6 commands (view, session, rename, toggle, config, sync) and their edge cases.
- **Boundary test gaps**: The `hook-handler` has boundary tests (`stop-trigger.boundary.test.ts`, `post-tool-use-trigger.boundary.test.ts`). Assess whether other integration boundaries (server routes ↔ services, shared/sync ↔ filesystem) have similar boundary tests.

## Exploration guidance

Start by mapping test coverage:

- List all `.test.ts` files: there are 73 across the monorepo. Compare against source files to find gaps.
- Key untested areas to check: `desktop/src/` (0 tests), `client/src/pages/` (check each page directory for test files), `client/src/context/` (check each context), `client/src/components/` (check each component).

Then assess test quality in existing tests:

- `server/src/routes/sessions/sessions.test.ts` — route-level tests, check mock depth.
- `server/src/__tests__/mocks/services.ts` — shared mock file, check what it mocks.
- `client/__tests__/mocks/` — Cloudscape component mocks, check if they're adequate or if they hide real rendering issues.
- `client/__tests__/setup.ts` — test setup, check what's globally mocked.
- `hook-handler/src/__test-helpers__/` — shared test helpers, check quality.

For module-level state testing:

- `server/src/services/storage/lifecycle.test.ts` — does it clean up intervals?
- `server/src/services/event-bus.test.ts` — does it clean up listeners between tests?

Grep for patterns that indicate weak tests:

- `toBeInTheDocument()` with only a heading or title text
- `toHaveBeenCalled()` without checking arguments
- `expect(true)` or `expect(result).toBeDefined()`

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
