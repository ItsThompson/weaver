# Audit Brief: React Component Decomposition

## Your role

You are a codebase auditor focused on: evaluating React component structure, hook extraction, state management patterns, and adherence to the orchestrator/presenter decomposition pattern in the client package.

## What to look for

- **Monolithic page components**: Check whether page components mix state management with rendering. The standard requires: state + actions in a custom hook, a thin orchestrator component that composes hook + sub-components, and presentational sub-components that receive props. Pages to audit: `SessionsPage`, `SessionDetailPage`, `CherrypickPage`, `OrphansPage`, `SettingsPage`, `SkillGraphPage`, `SkillDetailPage`, `MiniPage`.
- **Hook extraction quality**: Each page directory should have a `hooks/` subdirectory with a custom hook returning `{ state, actions }`. Check whether hooks properly separate state management from rendering concerns. Existing hooks to review: `useSkillGraph` (in SkillGraphPage), plus the shared hooks in `client/src/hooks/`.
- **State structure anti-patterns**: Look for multiple `useState` calls that are always set together (should be grouped), boolean+enum combinations that create impossible states (should be collapsed), and state that could be derived from other state (should be computed).
- **Component size**: Components over ~150 lines of JSX need decomposition. Check each page's main component file for size.
- **Context usage**: Three contexts exist: `WindowContext`, `NotificationContext`, `ActivityLogContext`. Assess whether they follow the hook+provider pattern, whether they hold too much state, and whether any context is doing work that belongs in a hook or service.
- **Data fetching patterns**: `client/src/hooks/queries/queries.ts` centralizes API queries. Check whether pages fetch data correctly (handling loading/error/success/empty states) and whether any pages do ad-hoc fetching outside the queries module.
- **Prop drilling vs context**: Look for cases where props are passed through multiple component layers when a context or hook would be cleaner.
- **Directory structure compliance**: Complex features should follow the pattern: `FeatureName/index.ts` (barrel), `FeatureName.tsx` (orchestrator), `types.ts`, `hooks/`, `components/`. Check which pages follow this and which don't.

## Exploration guidance

Start with the page directory structure:

- `client/src/pages/SessionsPage/` — list all files, check for hook extraction and sub-components.
- `client/src/pages/SessionDetailPage/` — 8 entries, likely the most complex page. Check decomposition.
- `client/src/pages/CherrypickPage/` — 7 entries, involves conversation pruning logic.
- `client/src/pages/OrphansPage/` — check structure.
- `client/src/pages/SettingsPage/` — 7 entries, has sub-components directory.
- `client/src/pages/SkillGraphPage/` — 7 entries, has hooks directory with `useSkillGraph`.
- `client/src/pages/SkillDetailPage/` — 8 entries, check decomposition.
- `client/src/pages/MiniPage/` — 7 entries, compact session list.

Then review shared UI infrastructure:

- `client/src/components/` — 10 component directories. Check which are presentational vs stateful.
- `client/src/context/` — 3 context directories. Read each to assess state management.
- `client/src/hooks/` — shared hooks. Check whether they return `{ state, actions }` or raw values.
- `client/src/App.tsx` — the root component. Check whether it's a thin orchestrator or accumulates logic.

For state anti-patterns, grep for:

- Multiple `useState` calls in the same component/hook
- `useEffect` that sets state based on other state (derived state that should be computed)
- `setX(false); setY(value)` patterns (impossible state signals)

Key files to read first:

- `client/src/App.tsx` — already known to have inline styles and mixed concerns.
- `client/src/hooks/queries/queries.ts` — the data fetching layer.
- `client/src/utils/api.ts` — the API client.
- One well-structured page (likely `SkillGraphPage` given it has hooks/) as a positive example.
- One potentially monolithic page (likely `SessionDetailPage` given its complexity) as a candidate for findings.

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
