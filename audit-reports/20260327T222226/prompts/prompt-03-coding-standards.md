# Audit Brief: Coding Standards and Best Practices

## Your role

You are a codebase auditor focused on: verifying adherence to the project's TypeScript, backend, and frontend coding standards across all workspace packages.

## What to look for

- **For-loop usage instead of functional iteration**: The standard requires `forEach`, `map`, `filter`, `reduce`, `flatMap`, `find`, `some`, `every` instead of `for` loops. Also check for chained `filter+map` that should be a single `reduce`. Scan all `.ts` and `.tsx` files.
- **Terse variable names**: The standard requires descriptive names. Single-letter names (except `i`/`j` for indices, `_` for unused, `e` for event handlers) are violations. Check callbacks especially: `(c) =>`, `(r) =>`, `(w) =>`, `(s) =>` patterns.
- **Module-level side effects**: The backend standard forbids reading `process.env` at module level (use lazy arrow functions) and instantiating clients at module level (use lazy singletons). Check `server/src/`, `hook-handler/src/`, `cli/src/`, and `desktop/src/` for violations.
- **Structured logging violations**: The backend standard requires a shared `log()` function with structured JSON output. No ad-hoc `console.log` with string interpolation. Check all server-side code for raw `console.log` or `console.error` calls.
- **Import ordering**: The frontend standard requires: React → external libraries → internal modules → local files. Check `client/src/` files.
- **Default exports**: The frontend standard requires named exports only. Check all `client/src/` files for `export default`.
- **Guard clause violations**: The standard prefers early returns over nested `if/else` chains. Look for deeply nested conditionals (3+ levels) in any `.ts`/`.tsx` file.
- **Type placement**: Types should be in dedicated `types.ts` or `schemas.ts` files, not inline in implementation files. Check whether implementation files define their own interfaces/types that should be extracted.

## Embedded coding standards reference

The explorer agents do not have access to the skills files. Here are the specific rules to check against:

### TypeScript Standards

1. **Functional iteration over for loops**: Use `forEach`, `map`, `filter`, `reduce`, `flatMap`, `find`, `some`, `every`. Avoid `for` loops entirely. Avoid chaining `filter+map` — use `reduce` for single-pass.
2. **Verbose naming**: Descriptive variable names in all contexts. `(prev) =>` not `(c) =>`. `(runner) =>` not `(r) =>`. Exceptions: `i`/`j` for indices, `_` for unused, `e` for inline event handlers.
3. **Types in dedicated files**: `types.ts` or `schemas.ts`, separate from implementation.
4. **Enums over string literal unions**: For fixed sets used across multiple files. PascalCase name, UPPER_SNAKE_CASE keys.
5. **Guard clauses**: Early returns over nested conditionals. Refactor to factory/facade when accumulating nested branches.
6. **Specific imports**: `import throttle from 'lodash/throttle'` not `import { throttle } from 'lodash'`.
7. **No flat type intersections**: Split into structured types with named properties when combining data for different purposes.

### Backend Standards

1. **Structured logging**: Use a shared `log()` function outputting JSON with `timestamp` and `event`. No `console.log` with string interpolation.
2. **No module-level SDK clients**: Use lazy singleton pattern.
3. **No module-level `process.env` reads**: Use `const VAR = () => process.env.VAR!` pattern.
4. **Thin handlers**: Route handlers parse, log, delegate. No business logic beyond routing.
5. **Zod for external data validation**: Runtime validation of external inputs.

### Frontend Standards

1. **Named exports only**: Never `export default`.
2. **Theme values from design system**: No hardcoded colors/sizes.
3. **Import order**: React → external → internal → local.
4. **Actions over reactions**: Track behavior in click handlers, not `useEffect` reactions.
5. **Links over navigation handlers**: Use `<a href>` when navigating, not `onClick` + `window.location.href`.
6. **Throttle cleanup**: Cancel throttled/debounced functions on unmount.
7. **Group state that changes together**: Merge multiple `useState` calls that are always set together.
8. **Eliminate impossible states**: Collapse boolean+enum combinations into single status variables.
9. **Error handling**: Combine user notifications with error tracking. Never silently swallow errors.

## Exploration guidance

Start with a broad scan:

- Grep for `for (` and `for(` across all `.ts`/`.tsx` files to find for-loop violations.
- Grep for `console.log` and `console.error` in `server/src/`, `hook-handler/src/`, `cli/src/` to find logging violations.
- Grep for `export default` in `client/src/` to find default export violations.
- Grep for `process.env` at the top level of files in `server/src/` and `hook-handler/src/`.

Then do targeted file reviews:

- `server/src/routes/sessions/sessions.ts` — large route file, check for thin handler pattern.
- `server/src/services/storage/lifecycle.ts` — uses `execFileSync`, module-level state.
- `shared/sync/sync.ts` — uses `readdirSync`, `existsSync` (synchronous fs in shared code).
- `client/src/App.tsx` — check import ordering, named exports, state structure.
- `client/src/pages/` — check each page for component standards.
- `hook-handler/src/validate/` — check for guard clauses and naming.
- `desktop/src/main.ts` — check for module-level state, logging patterns.

For naming violations, grep for short callback patterns:

- `(s) =>`, `(c) =>`, `(r) =>`, `(w) =>`, `(f) =>`, `(e) =>` (excluding event handlers)

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
