# Audit Brief: Test Quality and Architecture

## Your role

You are a codebase auditor focused on: assessing the overall testing strategy — whether tests exercise real code paths or hide behind mocks, whether they test through public interfaces or reach into internals, where critical paths lack coverage, and what it would take to make this a codebase where tests give genuine confidence.

## What to look for

- **Sociable vs solitary test ratio.** For each package, determine what percentage of tests use real implementations of internal collaborators vs mocking them out. The project's own testing standard says: "Write tests that exercise real code paths. Use real implementations of internal collaborators and only mock dependencies that are truly external." Measure how well the codebase follows this.

- **Tests that reach into internals.** Tests that import unexported functions, access private state, or assert on internal implementation details rather than the module's public API. Look for:
  - Tests that import from deep paths (e.g., `../../services/storage/sessions` instead of `../../services/storage`) to access non-public functions
  - Tests that assert on internal cache state, internal Maps/Sets, or module-level variables
  - Tests that verify the order of internal function calls rather than the final output

- **Coverage gaps on critical paths.** Identify the most important code paths that lack test coverage:
  - `server/src/services/webhook/handler.ts` — the `handleWebhookEvent` function orchestrates config reading, log parsing, payload building, dispatching, and timer management. Are all branches tested (no URL, disabled session, pending approval timer, error in timer callback)?
  - `server/src/services/storage/lifecycle.ts` — stale session cleanup, PID polling. Are race conditions and error paths tested?
  - `desktop/src/` — 8 source files with 0 test files. Is the Electron layer tested at all (unit or E2E)?
  - `cli/src/commands/` — 6 command files but only 1 test file (`commands.test.ts`). Are individual commands tested?
  - `hook-handler/src/inject/inject.ts` and `hook-handler/src/validate/validate.ts` — top-level orchestrators. Do they have direct tests or only tests of their sub-modules?
  - `client/src/context/` — 3 context providers. Are they tested?
  - `client/src/hooks/useSessionEvents/`, `useSessionNotifications/`, `useNavigateOnView/`, `useWindowList/` — hooks without test files

- **Test structure and organization.** Evaluate:
  - Are test files co-located with source or in separate `__tests__` directories? (The codebase uses both patterns — is this intentional or inconsistent?)
  - Do test files follow a consistent naming convention?
  - Are test helpers and fixtures well-organized and reusable?
  - Is there duplication across test files that could be extracted?

- **Test assertion quality.** Look for:
  - Tests that only assert "it doesn't throw" or "it returns something" without checking the actual value
  - Tests with a single weak assertion (e.g., `expect(result).toBeDefined()`) when the result has a rich structure
  - Tests that assert on mock call counts/args as their primary assertion instead of observable output
  - Tests where the description says one thing but the assertions test something else

- **E2E test coverage.** The `e2e/` directory has Playwright tests. Check:
  - What user flows are covered (navigation, sessions, config, ghost mode, mini mode, tray menu)?
  - Are there gaps in E2E coverage for critical features (cherrypick, webhooks, validation hooks)?
  - Do E2E tests overlap significantly with unit tests, or do they test different things?

- **Test confidence assessment.** For each package, answer: if you refactored the internals of a module without changing its public API, would the tests still pass? If yes, the tests are testing behavior. If no, they're testing implementation.

## Exploration guidance

**Package-by-package test inventory:**

`server/` (39 test files):

- Routes: `sessions.test.ts`, `helpers.test.ts`, `delete.test.ts`, `skills.test.ts`, `orphans.test.ts`, `events.test.ts`, `config.test.ts`
- Services: tests in log-parser (4), webhook (3), config/validators (3), config (1), orphan-storage (4), storage (2), keep-awake (1), skill-graph (6), file-cache (1), skill-resolver (6), event-bus (1)
- Mock infrastructure: `__tests__/mocks/services.ts`, `fs.ts`, `child-process.ts`, `logger.ts`, `skill-resolver.ts`
- Fixtures: `__tests__/fixtures/sessions.ts`, `skills.ts`

`hook-handler/` (13 test files):

- Validate: run-validation (4 tests), stop-hook, exit, glob, commands, logging
- Inject: run-inject, formatting
- Config: test-runners, find-config
- Other: changed-files, agent-tests, scope, path-utils, turn-boundary
- Mock infrastructure: `validate/__test-helpers__/mock-validate-deps.ts`

`shared/` (4 test files):

- Sync: sync.test.ts, project-config.test.ts, patch-agent-config.test.ts, timeout-calc.test.ts
- Mock infrastructure: `__test-helpers__/mock-fs.ts`, `mock-os.ts`, `sync-helpers.ts`

`client/` (24 test files):

- Utils: prune-conversation, group-exchanges
- Components: DirectoryPicker, ValidationBanner, ToolCallCard (3), ActivityIndicator, CommandPalette
- Hooks: notificationUtils, useSkillGraph, useSettings
- Pages: SkillDetailPage (2), SessionDetailPage (3), SettingsPage (5), SessionsPage (2), OrphansPage (4), MiniPage (2)
- Mock infrastructure: `__tests__/mocks/queries.ts`, `api.ts`

`cli/` (1 test file):

- `commands.test.ts` — covers all 6 command files?

`desktop/` (0 test files):

- 8 source files, no unit tests

`e2e/` (10 spec files):

- navigation, smoke, tray-menu, ghost-mode, sessions, seed, window-toggle, app-lifecycle, config, mini-mode

**Key files to examine for test quality:**

- Pick 2-3 test files from each package and evaluate assertion quality
- Compare route tests (which use the centralized mock) against service tests (which may be more focused)
- Check if `server/src/services/log-parser/*.test.ts` files test pure logic without mocks (they should)
- Check if `server/src/services/config/validators/*.test.ts` files test pure validation without mocks (they should)

**Coverage gap analysis:**

- List all source files, list all test files, find source files with no corresponding test
- Pay special attention to orchestrator files: `server/src/index.ts`, `hook-handler/src/validate/validate.ts`, `hook-handler/src/inject/inject.ts`

**The project's own testing standards (agents do NOT have access to the skills files):**

The codebase defines these testing rules:

1. **Sociable tests by default.** "Write tests that exercise real code paths. Use real implementations of internal collaborators and only mock dependencies that are truly external to the module under test."

2. **What counts as external (legitimate mock targets):** Network calls, databases, filesystem access, timers/dates/randomness, third-party services.

3. **What should NOT be mocked:** Internal functions or helpers within the module under test. Sibling modules that are part of the same bounded context. Pure logic (calculations, validations, transformations).

4. **Test through the public interface.** "Assert on outputs and observable side effects, not on how the module internally arrives at the result."

5. **Never weaken tests to make them pass.** "Fix the test infrastructure (mocks, setup, fixtures), not the assertions."

6. **New code requires tests.** "Every new function, module, or file must ship with unit tests."

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
