# Audit Brief: Overengineering

## Your role

You are a codebase auditor focused on: finding abstractions that add complexity without earning their keep — shallow modules where the interface is nearly as complex as the implementation, unnecessary indirection layers, premature generalization, wrapper classes that just delegate, and config-driven patterns where a simple function would suffice.

## What to look for

- **Shallow modules.** Modules where the exported interface (number of functions, parameter complexity) is nearly as complex as the implementation behind it. A deep module has a small interface hiding significant complexity. A shallow module is the opposite: lots of surface area, little depth. Look for barrel `index.ts` files that re-export everything from a single implementation file with minimal transformation.
- **Unnecessary indirection layers.** Files that exist only to re-export from another file, or functions that just call through to another function with the same signature. The codebase has many `index.ts` barrel files — check whether they add value or just add a hop.
- **Premature generalization.** Abstractions built for flexibility that's never used. For example:
  - The config validator system (`server/src/services/config/validators/`) has a `types.ts`, `factory.ts`, `registry.ts`, `field.ts`, and `index.ts` for what amounts to a set of validation functions. Is this registry/factory pattern justified by the actual usage, or would a single file with validator functions suffice?
  - The `FileCache<T>` class in `server/src/services/file-cache/file-cache.ts` — is the generic parameterization used with multiple types, or is it always `FileCache<ParsedSkill>` or similar?
- **Wrapper classes that just delegate.** Classes or functions that wrap another API without adding meaningful behavior. Check if any service modules are thin wrappers around `node:fs` or other standard APIs.
- **Config-driven patterns where a function would suffice.** The `FIELD_VALIDATORS` registry in `server/src/services/config/validators/registry.ts` maps field names to validator functions. Check whether this indirection is needed or if a simple `validateConfig(obj)` function with inline checks would be clearer.
- **Over-decomposed directories.** Directories where every function lives in its own file with its own `index.ts`, creating many small files that are always used together. Check:
  - `server/src/services/orphan-storage/` — has `read.ts`, `assign.ts`, `delete.ts`, `helpers.ts`, `errors.ts`, `paths.ts`, `index.ts` for what may be a simple CRUD module
  - `hook-handler/src/validate/` — deeply nested with `stop-hook/`, `exit/`, `glob/`, `commands/`, `logging/`, `run-validation/`, each with their own `index.ts`
  - `server/src/services/skill-resolver/` — 7 implementation files + index for skill path resolution
- **Abstraction layers that mirror their dependencies.** If a module's public API is essentially the same shape as the underlying library it wraps, the abstraction isn't earning its keep.

## Exploration guidance

Start by examining the module structure and barrel exports:

**Config validators (potential over-abstraction):**

- `server/src/services/config/validators/types.ts` — 2-line type file
- `server/src/services/config/validators/factory.ts` — generic validator factories
- `server/src/services/config/validators/field.ts` — specific field validators
- `server/src/services/config/validators/registry.ts` — maps field names to validators
- `server/src/services/config/validators/index.ts` — re-exports
- `server/src/services/config/config.ts` — the actual consumer

**Orphan storage (potential over-decomposition):**

- `server/src/services/orphan-storage/` — read, assign, delete, helpers, errors, paths, index
- Check if these files are small enough to be a single module

**Skill resolver (potential over-decomposition):**

- `server/src/services/skill-resolver/` — skill-name.ts, skill-uri.ts, resolve-configured.ts, agent-config.ts, kiro-paths.ts, list-skill-dirs.ts, index.ts
- Check how many of these are used independently vs always together

**Hook handler validate tree (deep nesting):**

- `hook-handler/src/validate/` — 6 subdirectories, each with implementation + index + test
- Check if the subdirectory structure adds clarity or just navigation overhead

**Barrel exports across the codebase:**

- Grep for `index.ts` files that only contain `export { ... } from` statements
- Count how many are pure re-exports vs files that compose or transform

**FileCache generic:**

- `server/src/services/file-cache/file-cache.ts` — check all instantiation sites to see if the generic is used with multiple types

For each candidate, measure:

1. Lines of interface (exports, parameters) vs lines of implementation
2. Number of callers — is the abstraction used in multiple places or just one?
3. Would inlining the abstraction make the code simpler?

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
