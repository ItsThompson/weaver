# Audit Report: Overengineering

## Summary

The codebase has a pervasive one-function-per-directory pattern in `hook-handler/src/` where tiny modules (some as small as 4 lines of implementation) each get their own directory with an `index.ts` barrel file. Of 36 barrel `index.ts` files across the source tree, 26 (72%) are ≤2 lines — pure re-exports that add a navigation hop without adding value. The config validator system uses a registry/factory pattern that is heavier than the problem warrants, and the orphan-storage module is split across 7 files for ~200 lines of implementation. The `FileCache<T>` generic is well-justified (4 distinct type instantiations), and the skill-graph module's decomposition is reasonable given its complexity.

## Findings

### 1. Single-function directories in hook-handler

- **Area**: `hook-handler/src/path-utils/`, `hook-handler/src/changed-files/`, `hook-handler/src/turn-boundary/`, `hook-handler/src/agent-tests/`, `hook-handler/src/scope/`, `hook-handler/src/config/project-config/`
- **Observation**: Each of these directories contains exactly one implementation file, one test file, and one `index.ts` that re-exports a single symbol. The most extreme case is `path-utils/`:

  `path-utils/index.ts` (1 line):

  ```ts
  export { isWithinDir } from "./path-utils";
  ```

  `path-utils/path-utils.ts` (4 lines of implementation):

  ```ts
  import { resolve, relative, isAbsolute } from "node:path";
  export function isWithinDir(filePath: string, dir: string): boolean {
    const rel = relative(dir, resolve(filePath));
    return !rel.startsWith("..") && !isAbsolute(rel);
  }
  ```

  Similarly, `config/project-config/index.ts` is a single re-export of a re-export:

  ```ts
  export { readProjectConfig } from "@weaver/shared/sync";
  ```

  This is a directory that exists solely to re-export a function from another package. The directory adds zero implementation.

  `changed-files/changed-files.ts` is 15 lines. `turn-boundary/turn-boundary.ts` is 30 lines. `agent-tests/agent-tests.ts` is 55 lines. Each gets its own directory with 3 files.

- **Impact**: Navigation overhead. Understanding the validation flow requires bouncing through 6+ directories. The `index.ts` files are noise — they're always 1 line and always re-export everything from the sibling file. The directory structure implies these are independent modules, but they're tightly coupled: `changed-files` imports from `turn-boundary`, `scope` imports from `path-utils`, `stop-trigger` imports from `changed-files`, `agent-tests`, `scope`, and `path-utils`. They're a single conceptual unit split across 6 directories.
- **Suggestion**: Merge `path-utils`, `changed-files`, `turn-boundary`, and `agent-tests` into a single `session-analysis/` module. These all operate on the same session log data and share a call chain. The `config/project-config/` directory should be eliminated — its sole re-export can move to `config/index.ts`.
- **Severity**: High

### 2. Validate subdirectory tree in hook-handler

- **Area**: `hook-handler/src/validate/glob/`, `hook-handler/src/validate/commands/`, `hook-handler/src/validate/logging/`, `hook-handler/src/validate/exit/`, `hook-handler/src/validate/stop-hook/`, `hook-handler/src/validate/run-validation/`
- **Observation**: 6 subdirectories under `validate/`, each with implementation + index + test. The barrel files are all single-line re-exports:

  ```
  glob/index.ts:        export { matchesExtensionGlob } from "./glob";
  commands/index.ts:    export { substituteVars, commandUsesVar, runCommand } from "./commands";
  logging/index.ts:     export { writeValidationEvent } from "./logging";
  stop-hook/index.ts:   export { runStopHook } from "./stop-hook";
  ```

  The implementation files are small:
  - `glob/glob.ts`: 18 lines — a single function doing extension matching
  - `commands/commands.ts`: 40 lines — 3 functions (substitute vars, check var usage, run command)
  - `logging/logging.ts`: 30 lines — a single function writing a validation event
  - `exit/exit.ts`: 25 lines — a single function determining exit code

  These are all consumed by `run-validation/` and `stop-hook/`. No other module in the codebase imports from `glob/`, `commands/`, `logging/`, or `exit/` directly. They are internal implementation details of the validation feature, yet they're structured as if they were independent, reusable modules.

  The top-level `validate/index.ts` then re-exports selectively from these subdirectories:

  ```ts
  export { runValidation, parseArgs } from "./run-validation";
  export type { ValidateArgs } from "./run-validation";
  export type { ValidateResult } from "./exit";
  export { matchesExtensionGlob } from "./glob";
  export { runStopHook } from "./stop-hook";
  ```

- **Impact**: To trace how a validation runs, you must navigate: `validate/index.ts` → `run-validation/index.ts` → `run-validation/run-validation.ts` → `stop-trigger.ts` → `../stop-hook/index.ts` → `../stop-hook/stop-hook.ts` → `../commands/index.ts` → `../commands/commands.ts`. That's 8 file hops for a linear call chain. The directory structure suggests modularity that doesn't exist — these files are always used together and have no independent consumers.
- **Suggestion**: Flatten `glob`, `commands`, `logging`, and `exit` into the `validate/` directory directly (no subdirectories). They're internal helpers, not independent modules. The `run-validation/` subdirectory is justified since it has 4 implementation files, but the others are single-file modules that don't need directory isolation.
- **Severity**: High

### 3. Orphan storage over-decomposition

- **Area**: `server/src/services/orphan-storage/` — 7 files: `read.ts`, `assign.ts`, `delete.ts`, `helpers.ts`, `errors.ts`, `paths.ts`, `index.ts`
- **Observation**: The total implementation (excluding tests) is ~200 lines across 7 files. Two files are trivially small:

  `errors.ts` (5 lines):

  ```ts
  export class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NotFoundError";
    }
  }
  ```

  `paths.ts` (5 lines):

  ```ts
  export const ORPHAN_PATH = () =>
    join(homedir(), ".weaver", "logs", "orphan.jsonl");
  export const LOGS_DIR = () => join(homedir(), ".weaver", "logs");
  ```

  `helpers.ts` exports 3 functions (`partitionByPid`, `requireOrphanFile`, `writeRemaining`) that are only used by `assign.ts` and `delete.ts`. The `assign.ts` and `delete.ts` files share the same pattern: read file → partition by PID → write remaining. The `index.ts` re-exports 4 symbols.

  The module's public interface (4 exports: `readOrphanEvents`, `groupByPid`, `assignOrphanEvents`, `deleteOrphanEvents`, `NotFoundError`) is nearly as complex as its implementation. This is a shallow module.

- **Impact**: 7 files for a simple CRUD module means every change requires touching multiple files. The `helpers.ts` extraction doesn't help testability — the helpers are tested indirectly through `assign.test.ts` and `delete.test.ts`, plus `helpers.test.ts` tests them directly. This is redundant coverage.
- **Suggestion**: Merge into 2 files: `orphan-storage.ts` (all implementation, ~200 lines) and `index.ts` (re-exports). The `NotFoundError` class, path constants, and helper functions are internal details that don't need file-level isolation.
- **Severity**: Medium

### 4. Config validator registry/factory pattern

- **Area**: `server/src/services/config/validators/` — 6 files: `types.ts`, `factory.ts`, `field.ts`, `registry.ts`, `validate-paths.ts`, `index.ts`
- **Observation**: The `types.ts` file is 2 lines:

  ```ts
  export type ValidatorResult = { value?: unknown; warning?: string };
  export type FieldValidator = (value: unknown) => ValidatorResult;
  ```

  The `factory.ts` has 2 generic factory functions (`validateBoolean`, `validateDisplayOptions`) that are used to create 5 validators total (3 boolean, 2 display options). The `registry.ts` maps 12 field names to validator functions:

  ```ts
  export const FIELD_VALIDATORS: Record<string, FieldValidator> = {
    enable_notification_sounds: validateBoolean("enable_notification_sounds"),
    dark_mode: validateBoolean("dark_mode"),
    // ... 10 more
  };
  ```

  The consumer (`config.ts`) uses this registry in a simple loop:

  ```ts
  Object.keys(obj).forEach((key) => {
    const validator = FIELD_VALIDATORS[key];
    if (!validator) return;
    const result = validator(obj[key]);
    // ...
  });
  ```

  The registry pattern adds indirection without adding flexibility. There's exactly one consumer. The `Record<string, FieldValidator>` type means you lose type safety on field names — any string is accepted. A direct `switch` or object literal in `config.ts` would be equally clear and wouldn't require 4 supporting files.

  The `factory.ts` factories are premature generalization. `validateBoolean` is called 3 times. `validateDisplayOptions` is called 2 times. The factory saves ~5 lines per call site but introduces a level of indirection and a separate file.

- **Impact**: Understanding config validation requires reading 5 files. The `types.ts` → `factory.ts` → `field.ts` → `registry.ts` → `config.ts` chain is a lot of hops for what amounts to "validate each field according to its type." The factory pattern would be justified if validators were dynamically registered or if there were dozens of boolean fields, but with 12 total validators, inline definitions would be clearer.
- **Suggestion**: Merge `types.ts`, `factory.ts`, and `registry.ts` into `field.ts` (or a single `validators.ts`). The 2-line type alias can live at the top of the file. The factory functions can be inlined or kept as local helpers. The registry object can be the default export. This reduces 5 files to 2 (`validators.ts` + `validate-paths.ts`, since the latter has async I/O and is a different concern).
- **Severity**: Medium

### 5. Pervasive 1-line barrel re-exports

- **Area**: 26 of 36 `index.ts` files across `server/src/`, `hook-handler/src/`, and `shared/` are ≤2 lines
- **Observation**: Examples of pure pass-through barrels:

  ```
  server/src/routes/orphans/index.ts:     export * from "./orphans";
  server/src/routes/events/index.ts:      export * from "./events";
  server/src/services/config/index.ts:    export * from "./config";
  server/src/services/file-cache/index.ts: export * from "./file-cache";
  shared/utils/index.ts:                  export * from "./format";
  ```

  Each of these directories contains exactly one implementation file. The `index.ts` exists only so that imports can use the directory path (`from "./config"` instead of `from "./config/config"`). This is a convention choice, but it means 26 files exist purely for import aesthetics.

  The `shared/utils/index.ts` is particularly odd: it re-exports only `format.ts` (a single 3-line function), while `shared/utils/fs.ts` (3 utility functions used by `shared/sync/project-config.ts`) is imported directly and not re-exported through the barrel. This inconsistency suggests the barrel pattern was applied mechanically rather than intentionally.

- **Impact**: Low individually, but cumulatively these 26 files add noise to the codebase. They appear in search results, inflate file counts, and create an extra hop when navigating to implementations. In directories with a single implementation file, the barrel adds no organizational value.
- **Suggestion**: For single-implementation directories, either name the implementation file `index.ts` directly (eliminating the barrel) or accept the longer import path. Reserve barrel files for directories that genuinely compose multiple sub-modules (like `server/src/services/log-parser/index.ts` which aggregates 4 implementation files — that barrel earns its keep).
- **Severity**: Low

### 6. Skill-graph module decomposition

- **Area**: `server/src/services/skill-graph/` — 8 implementation files + index
- **Observation**: This module has: `types.ts` (11 lines), `constants.ts` (1 line), `parse-skill.ts` (8 lines), `utils.ts` (20 lines), `category.ts` (15 lines), `discover.ts` (65 lines), `build-graph.ts` (60 lines), `get-skill-detail.ts` (75 lines), `index.ts` (2 lines).

  The `constants.ts` is a single regex:

  ```ts
  export const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;
  ```

  The `parse-skill.ts` is a 3-line wrapper around `gray-matter`:

  ```ts
  export function parseSkillFile(content: string) {
    const { data, content: body } = matter(content);
    return { frontmatter: data, body };
  }
  ```

  However, the index only exports 2 functions (`buildSkillGraph`, `getSkillDetail`), hiding 6 internal files. This is closer to the "deep module" ideal — small interface, larger implementation. The internal files have genuine separation of concerns (parsing, discovery, graph construction, detail retrieval).

- **Impact**: The `constants.ts` (1 line) and `parse-skill.ts` (3 lines of implementation) are unnecessarily isolated, but the overall module structure is defensible. The internal files are used by multiple siblings within the module.
- **Suggestion**: Inline `constants.ts` into `get-skill-detail.ts` (its only consumer outside tests). Consider inlining `parse-skill.ts` into `discover.ts` (its primary consumer). The rest of the decomposition is reasonable.
- **Severity**: Low

## Deepening Candidates

### 1. Hook-handler session analysis cluster

- **Cluster**: `hook-handler/src/turn-boundary/`, `hook-handler/src/changed-files/`, `hook-handler/src/agent-tests/`, `hook-handler/src/path-utils/`
- **Why they're coupled**: Linear call chain. `changed-files` imports `turn-boundary`. `agent-tests` imports `turn-boundary`. `scope` imports `path-utils`. `stop-trigger` imports all four. They all operate on session log data (reading JSONL, extracting events, deriving file lists). Shared types: `HookEvent` from `@weaver/shared/types`.
- **Dependency category**: In-process (pure functions operating on file data)
- **Test impact**: `changed-files.test.ts`, `turn-boundary.test.ts`, `agent-tests.test.ts`, `path-utils.test.ts` would merge into a single test file testing the combined module's public API. The 4 separate test files currently test internal boundaries that would become implementation details.

### 2. Validate internal helpers cluster

- **Cluster**: `hook-handler/src/validate/glob/`, `hook-handler/src/validate/commands/`, `hook-handler/src/validate/logging/`, `hook-handler/src/validate/exit/`
- **Why they're coupled**: All 4 are consumed exclusively by `run-validation/` and `stop-hook/`. No external consumers. They share the `ValidationResult` type. `stop-hook` calls `matchesExtensionGlob`, `substituteVars`, `commandUsesVar`, `runCommand`. `stop-trigger` calls `writeValidationEvent`, `handleExitLogic`. These are internal implementation details of the validation feature.
- **Dependency category**: In-process (pure functions + synchronous I/O)
- **Test impact**: `glob.test.ts` (4 tests), `commands.test.ts` (12 tests), `logging.test.ts` (5 tests), `exit.test.ts` (5 tests) would be replaced by boundary tests on `runValidation` and `runStopHook`. The existing `run-validation.test.ts` and `stop-hook.test.ts` already test the integrated behavior, making the unit tests on internal helpers partially redundant.

### 3. Orphan storage

- **Cluster**: `server/src/services/orphan-storage/read.ts`, `assign.ts`, `delete.ts`, `helpers.ts`, `errors.ts`, `paths.ts`
- **Why they're coupled**: `assign.ts` and `delete.ts` both import `helpers.ts`, `errors.ts`, and `paths.ts`. `read.ts` imports `paths.ts`. The `helpers.ts` functions (`partitionByPid`, `requireOrphanFile`, `writeRemaining`) exist solely to serve `assign` and `delete`. All files share the `ORPHAN_PATH` constant and `NotFoundError` class.
- **Dependency category**: In-process (file I/O on local JSONL files)
- **Test impact**: `helpers.test.ts` tests would be subsumed by `assign.test.ts` and `delete.test.ts` (which already test the same code paths end-to-end). `read.test.ts` would remain as-is. Net reduction: 1 test file.

### 4. Config validators

- **Cluster**: `server/src/services/config/validators/types.ts`, `factory.ts`, `registry.ts`
- **Why they're coupled**: `registry.ts` imports both `types.ts` and `factory.ts`. `factory.ts` imports `types.ts`. `field.ts` imports `types.ts`. The 2-line type file is used by all three. The factory functions are only called in `registry.ts`. The registry is only consumed by `config.ts`.
- **Dependency category**: In-process (pure validation functions)
- **Test impact**: `factory.test.ts` tests would be subsumed by `field.test.ts` (which tests the same validators through the registry). The factory tests verify that `validateBoolean("field_name")` returns a function that validates booleans — this is already covered by testing the composed validators in the registry.

## Metrics

- Files examined: 87
- Findings: 6 (2 high, 2 medium, 2 low)
- Deepening candidates: 4
