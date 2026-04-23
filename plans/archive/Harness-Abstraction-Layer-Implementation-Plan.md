# Harness Abstraction Layer: Implementation Plan

## Overview

Separate kiro-cli specific implementations into a `bindings/kiro/` package and introduce a harness adapter pattern so Weaver can support multiple AI coding harnesses (kiro-cli, Claude Code, Codex, etc.) without changing core logic. The first additional binding targets Claude Code.

Extract validation logic from `hook-handler/` into a standalone `validation/` package that is harness-agnostic and reusable across all bindings.

This is a **major version bump** (breaking change). The JSONL log format changes from the kiro-cli specific `HookEvent` structure to a canonical `WeaverEvent` format. Old-format logs are not supported: the parser will gracefully ignore unrecognized entries. A one-time migration script is provided to backfill existing session and event logs.

### Success criteria

- All kiro-cli specific code lives in `bindings/kiro/`, not in `shared/`, `server/`, or `cli/`
- A `HarnessAdapter` interface exists in `shared/` that each binding implements
- A canonical `WeaverEvent` type replaces the current kiro-cli specific `HookEventData`
- Core packages (server, client, cli) consume only canonical types
- The kiro-cli binding passes all existing tests (no behavioral regression)
- A Claude Code binding skeleton exists and can parse Claude Code hook payloads into `WeaverEvent`
- Validation hooks (`.weaver.json`) work identically across both bindings via the `validation/` package
- `npm test` passes across all packages

### Assumptions and constraints

- This is a structural refactor: no new user-facing features
- The Claude Code binding is a skeleton with event parsing only (full feature parity is follow-up work)
- `.weaver.json` validation config format does not change
- `~/.weaver/` data directory structure does not change
- The JSONL log format changes to the canonical `WeaverEvent` format (breaking change, major version bump)
- Existing kiro-cli users experience zero behavioral change (after running the migration script)
- Turborepo workspace structure is preserved

## Approach

### High-level solution design

Introduce a `bindings/` directory at the monorepo root containing one sub-package per harness. Each binding implements a shared `HarnessAdapter` interface defined in `@weaver/shared`. The adapter is responsible for:

1. Parsing raw harness-specific hook payloads into canonical `WeaverEvent` objects
2. Providing the process name for alive-detection (Weaver-level lifecycle uses this)
3. Indicating whether the harness provides native session IDs (vs. the Weaver PID-based fallback)
4. Optionally syncing Weaver hook configuration into the harness's config files
5. Resolving skill/agent paths for the harness
6. Cleaning up harness-specific resources on session deletion

Each binding has its own complete set of shell scripts (entry point, session management, truncation, validation dispatch, init). No shared shell scripts exist between bindings because each harness has a different payload format, session management model, and config structure.

The hook-handler shell script for each binding orchestrates two operations:
1. **Fire-and-forget**: calls a binding-specific `logEvent.ts` entry point that parses the raw event into canonical `WeaverEvent` format, writes it to the session JSONL, and notifies the server.
2. **Blocking**: calls the `validate.ts` entry point in the `validation/` package (passing `--harness` to select the adapter), which runs validation commands and returns an exit code that propagates back to the harness.

The `validation/` package is a standalone workspace package at the monorepo root. It contains all validation logic extracted from `hook-handler/`: the validation runner, prompt injection, session analysis (changed file extraction), config resolution, scope resolution, and command execution. It uses an adapter registry (from `@weaver/shared`) to parse events in the canonical format, making it harness-agnostic.

```
Harness (kiro-cli / Claude Code)
  │ raw JSON via STDIN
  ▼
bindings/<harness>/weaver-log.sh
  │ manages session (harness-specific)
  ├── fire-and-forget: node logEvent.mjs (binding-specific, writes WeaverEvent to JSONL)
  └── blocking: node validate.mjs --harness <name> (validation package, adapter registry)
        │ runs validation commands
        │ writes validation WeaverEvent to JSONL
        │ returns exit code
  ▼
Weaver core (server, client, cli, shared)
  │ consumes WeaverEvent only
  ▼
Dashboard, webhooks, cherrypick, etc.
```

### Key architectural decisions

1. **Adapter pattern with explicit registration (Approach 3)**: The adapter registry lives in `@weaver/shared` and exports `registerAdapter(adapter)` and `getAdapter(harness)`. Registration is explicit at each entry point: the validation package's `validate.ts`, the server's `index.ts`, and the CLI all import the binding modules and call `registerAdapter`. No side-effect imports, no dynamic `import()`. Adding a new harness means adding one import + one `registerAdapter` call to each entry point.

2. **Superset canonical event model**: `WeaverEvent` defines the union of all events across all harnesses. `WeaverEventName` is a TypeScript `enum` with `UPPER_SNAKE_CASE` keys. Adapters populate what they can. Downstream consumers render what's present and gracefully handle missing fields.

3. **Validation as a standalone package**: The `validation/` package contains all validation logic (runner, injection, session analysis, config resolution, scope, commands). It imports bindings via the adapter registry to parse events. The validation package has no coupling to any specific harness: it receives a `--harness` CLI arg, looks up the adapter, and operates on canonical `WeaverEvent` types. Validation's `logging.ts` imports `WeaverEvent` types from `@weaver/shared` and constructs canonical events when writing to the session JSONL.

4. **Event logging in each binding**: Each binding has a small `logEvent.ts` entry point (~15 lines) that imports its own adapter, parses the raw event, appends the canonical `WeaverEvent` to the JSONL, and notifies the server. This avoids creating a separate package for trivial logic.

5. **Config sync is adapter-owned**: kiro-cli patches `.kiro/agents/*.json`; Claude Code patches `.claude/settings.local.json`. `syncConfig` is optional on the `HarnessAdapter` interface.

6. **Type aliases for client compatibility**: `HookEvent`, `HookEventName`, and related types become `@deprecated` aliases for their canonical counterparts (`WeaverEvent`, `WeaverEventName`). This minimizes client-side changes.

7. **Breaking JSONL format change**: All logs are written in the new canonical `WeaverEvent` format (flat structure: `event.eventName` instead of `event.event.hook_event_name`). Old-format entries are gracefully skipped by the parser. A manual migration script backfills existing logs.

8. **`sessionId` is required**: Every `WeaverEvent` has a `sessionId: string`. For harnesses using the PID-based fallback (e.g., kiro-cli orphan events), `sessionId` is set to `"orphan"`. For harnesses providing native session IDs (e.g., Claude Code), the native ID is used directly as the Weaver session ID.

9. **PID-based session resolution is a Weaver-level fallback**: The marker file mechanism (`.current-session-{pid}`) is not kiro-specific. It is a generic fallback for any harness that does not provide native session IDs. `sessionMarkerPath` stays in `shared/paths/`. `cleanStaleSessions` stays in the server's lifecycle manager. Harnesses that provide native session IDs (like Claude Code) bypass this mechanism entirely.

10. **`isProcessRunning` is Weaver-level**: The lifecycle manager checks if a PID is alive and verifies the process args contain the adapter's `processName`. The adapter provides the process name string, not the detection logic.

11. **`Harness` enum on Session**: The `Session` interface gains a `harness: Harness` field (TypeScript enum, not a plain string). All sessions have a PID (needed for CLI commands like `weaver view` and `weaver rename`), even harnesses that provide native session IDs.

12. **No `bindings/common/` directory**: Every shell script is binding-specific. Each binding has its own complete set of scripts tailored to its payload format and session management model.

### Alternative approaches considered

- **Inversion (interfaces in shared, no bindings/ directory)**: Rejected because it would scatter harness-specific code across shared/ and server/ behind interfaces, making it harder to add new harnesses as self-contained packages.
- **Monolithic adapter with strategy pattern**: Rejected because a single package with conditional logic per harness would grow unwieldy as harness count increases.
- **Backward-compatible JSONL format**: Rejected. Supporting dual formats adds parser complexity and testing surface. A clean break with a migration script is simpler and ensures consistency across harnesses.
- **Validation in `shared/`**: Rejected. Validation is substantial (runner, injection, session analysis, config, scope, commands) and not all of it needs to be shared. A standalone package keeps `shared/` focused on types, paths, and utilities.
- **Separate event-logger package**: Rejected. `logEvent.ts` is ~15 lines per binding (parse, append, notify). A package with adapter registry and DI for this is over-engineering. Each binding owns its own tiny entry point.
- **Adapter registry with side-effect imports**: Rejected. Explicit registration at entry points (Approach 3) is clearer, avoids tree-shaking risks, and makes the dependency graph obvious.
- **Adapter registry in `server/`**: Rejected. Both the validation package and the server need the registry. Placing it in `shared/` avoids duplication. The registry itself doesn't import bindings: entry points do the registration.

### Claude Code hook protocol summary

Based on the [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), the key differences from kiro-cli:

| Aspect | kiro-cli | Claude Code |
|--------|----------|-------------|
| Session ID | Derived from PID via marker files (Weaver fallback) | Provided as `session_id` in every hook payload |
| Transcript | Not provided | Provided as `transcript_path` |
| Event names | `agentSpawn`, `stop`, `preToolUse`, `postToolUse`, `userPromptSubmit` | `SessionStart`, `Stop`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, plus many more (`SessionEnd`, `SubagentStart`, `Notification`, etc.) |
| Tool response shape | `{ success: boolean, result: unknown[] }` | Raw tool response object (varies by tool) |
| Permission mode | Not provided | Provided as `permission_mode` |
| Hook config location | `.kiro/agents/*.json` | `.claude/settings.json`, `.claude/settings.local.json` |
| Process name | `kiro-cli` (in process args) | `claude` (process name) |
| Global config dir | `~/.kiro` | `~/.claude` |
| PID needed? | Yes (session resolution + CLI) | Yes (CLI commands only; session ID from payload) |

### Session model

| Field | Kiro-cli | Claude Code |
|-------|----------|-------------|
| `id` | Weaver-generated UUID | Native `session_id` from payload |
| `pid` | Resolved via PID walk | Resolved via PID walk (for CLI) |
| `harness` | `Harness.KIRO_CLI` | `Harness.CLAUDE_CODE` |
| Marker file | Yes (maps PID → UUID at hook time) | No (session_id in payload) |

### Development workflow

Assessed complexity: **Complex** (cross-package restructuring, new architectural patterns, new package boundaries, touches 7+ packages).

Levels: ATDD + BDD + TDD.

Rationale: The refactor spans the entire monorepo, introduces new type contracts, and must maintain zero regression. Acceptance tests verify end-to-end behavior, BDD scenarios cover adapter boundary behavior, and TDD drives the new canonical types and adapter implementations.

## Implementation steps

### Step 1: Define canonical types and adapter registry in `shared/`

Create the `WeaverEvent` superset type, `Harness` enum, `HarnessAdapter` interface, adapter registry, and type aliases.

- Create `shared/types/weaver-event.ts` with the canonical event model
- Create `shared/types/harness.ts` with the `Harness` enum and `HarnessAdapter` interface
- Create `shared/adapter-registry.ts` with `registerAdapter(adapter)` and `getAdapter(harness)` functions backed by a `Map<string, HarnessAdapter>`
- Update `shared/types/index.ts` to export new types
- Add `@deprecated` type aliases in `shared/types/events.ts`: `HookEvent` → `WeaverEvent`, `HookEventName` → `WeaverEventName`, etc. with JSDoc pointing to canonical names

The `Harness` enum:
```typescript
enum Harness {
  KIRO_CLI = "kiro-cli",
  CLAUDE_CODE = "claude-code",
}
```

The `WeaverEventName` enum (TypeScript enum, `UPPER_SNAKE_CASE` keys):
```typescript
enum WeaverEventName {
  // Shared across harnesses
  AGENT_SPAWN = "agentSpawn",
  STOP = "stop",
  PRE_TOOL_USE = "preToolUse",
  POST_TOOL_USE = "postToolUse",
  USER_PROMPT_SUBMIT = "userPromptSubmit",
  VALIDATION = "validation",
  // Claude Code specific
  SESSION_START = "SessionStart",
  SESSION_END = "SessionEnd",
  SUBAGENT_START = "SubagentStart",
  SUBAGENT_STOP = "SubagentStop",
  NOTIFICATION = "Notification",
  POST_TOOL_USE_FAILURE = "PostToolUseFailure",
  PERMISSION_REQUEST = "PermissionRequest",
  PERMISSION_DENIED = "PermissionDenied",
  TASK_CREATED = "TaskCreated",
  TASK_COMPLETED = "TaskCompleted",
  STOP_FAILURE = "StopFailure",
  TEAMMATE_IDLE = "TeammateIdle",
  CONFIG_CHANGE = "ConfigChange",
  PRE_COMPACT = "PreCompact",
  POST_COMPACT = "PostCompact",
}
```

The `WeaverEvent` type:
- `sessionId: string` (required; `"orphan"` for PID-fallback events with no session)
- `timestamp: string`
- `harness: Harness`
- `eventName: WeaverEventName`
- `cwd: string`
- `pid?: number`
- `transcriptPath?: string`
- `prompt?: string`
- `toolName?: string`
- `toolInput?: Record<string, unknown>`
- `toolResponse?: { success: boolean; result: unknown[] }`
- `validationResults?: ValidationResult[]`
- `permissionMode?: string`
- `raw?: unknown` (original harness payload for debugging)

The `HarnessAdapter` interface:
- `name: string` (e.g., `"kiro-cli"`, `"claude-code"`)
- `processName: string` (for Weaver-level `isProcessRunning`: `"kiro-cli"`, `"claude"`)
- `providesSessionId: boolean` (`false` for kiro-cli, `true` for Claude Code)
- `parseEvent(raw: unknown): WeaverEvent`
- `globalConfigDir(): string` (e.g., `~/.kiro` or `~/.claude`)
- `skillSearchPaths(cwd: string): string[]` (returns both workspace and global paths)
- `cleanupSession(session: Session): Promise<void>` (kiro: delete marker file; Claude Code: no-op)
- `syncConfig?(cwd: string, options?: SyncOptions): SyncResult` (optional; kiro patches agent configs, Claude Code is follow-up)

The adapter registry (`shared/adapter-registry.ts`):
```typescript
const adapters = new Map<string, HarnessAdapter>();
export function registerAdapter(adapter: HarnessAdapter): void { adapters.set(adapter.name, adapter); }
export function getAdapter(harness: string): HarnessAdapter { /* throws for unknown */ }
```

Dependencies: None.

### Step 2: Create `bindings/` and `validation/` package structure

Set up the monorepo workspace entries and package scaffolding for all new packages.

- Create `bindings/kiro/package.json` (`@weaver/binding-kiro`)
- Create `bindings/claude-code/package.json` (`@weaver/binding-claude-code`)
- Create `validation/package.json` (`@weaver/validation`)
- Add all three to root `package.json` workspaces array
- Add to `turbo.json` pipeline if needed
- Create `tsconfig.json` and `vitest.config.ts` for each package
- Create `tsdown.config.ts` for each package

Dependencies: None.

### Step 3: Create the validation package

Extract all validation, injection, session analysis, config resolution, and scope logic from `hook-handler/` into the new `validation/` package.

Files moving to `validation/`:
- `hook-handler/src/validate/run-validation/` → `validation/src/run-validation/` (run-validation.ts, stop-trigger.ts, post-tool-use-trigger.ts, parse-args.ts, and tests)
- `hook-handler/src/validate/stop-hook/` → `validation/src/stop-hook/` (stop-hook.ts and tests)
- `hook-handler/src/validate/commands.ts` → `validation/src/commands.ts` (substituteVars, runCommand, and tests)
- `hook-handler/src/validate/glob.ts` → `validation/src/glob.ts` (matchesExtensionGlob, and tests)
- `hook-handler/src/validate/exit.ts` → `validation/src/exit.ts` (handleExitLogic, and tests)
- `hook-handler/src/validate/logging.ts` → `validation/src/logging.ts` (writeValidationEvent: updated to construct canonical `WeaverEvent`, and tests)
- `hook-handler/src/validate/validate.ts` → `validation/src/validate.ts` (CLI entry point: updated to accept `--harness`, register adapters, look up adapter via registry)
- `hook-handler/src/validate/index.ts` → `validation/src/index.ts`
- `hook-handler/src/scope/` → `validation/src/scope/` (resolveTestDirs, and tests)
- `hook-handler/src/session-analysis/` → `validation/src/session-analysis/` (extractChangedFiles, extractAgentTestedDirs, isWithinDir, and tests; updated to parse `WeaverEvent` instead of `HookEvent`)
- `hook-handler/src/config/find-config/` → `validation/src/config/find-config/` (findNearestConfig, groupFilesByConfig, and tests)
- `hook-handler/src/config/test-runners/` → `validation/src/config/test-runners/` (resolveTestRunners, and tests)
- `hook-handler/src/config/project-config/` → `validation/src/config/project-config/` (re-exports readProjectConfig from `@weaver/shared/sync`)
- `hook-handler/src/config/index.ts` → `validation/src/config/index.ts`
- `hook-handler/src/inject/` → `validation/src/inject/` (inject.ts entry point, run-inject/, formatting.ts, and tests)
- `hook-handler/src/__test-helpers__/events.ts` → `validation/src/__test-helpers__/events.ts` (shared event fixtures)
- `hook-handler/src/__test-helpers__/mock-fs.ts` → `validation/src/__test-helpers__/mock-fs.ts`
- `hook-handler/src/__test-helpers__/mock-child-process.ts` → `validation/src/__test-helpers__/mock-child-process.ts`
- `hook-handler/src/__test-helpers__/index.ts` → `validation/src/__test-helpers__/index.ts`
- `hook-handler/src/utils/logger.ts` → `validation/src/utils/logger.ts` (re-tagged from `"hook-handler"` to `"validation"`)

The `validate.ts` entry point uses explicit adapter registration (Approach 3):
```typescript
import { registerAdapter } from "@weaver/shared/adapter-registry";
import { kiroAdapter } from "@weaver/binding-kiro";
import { claudeCodeAdapter } from "@weaver/binding-claude-code";
registerAdapter(kiroAdapter);
registerAdapter(claudeCodeAdapter);
// ... parse --harness arg, getAdapter(harness), run validation
```

The `tsdown.config.ts` for the validation package has two entry points: `validate.ts` and `inject.ts`.

Dependencies: Step 1, Step 2.

### Step 4: Extract kiro-cli binding from `hook-handler/`

Move kiro-specific code into `bindings/kiro/`. Each shell script is kiro-specific (parses kiro payload format, manages kiro sessions).

Files moving to `bindings/kiro/`:
- `hook-handler/weaver-log.sh` → `bindings/kiro/weaver-log.sh` (updated: fire-and-forget `logEvent.mjs`, blocking `validate.mjs` from validation package)
- `hook-handler/lib/pid.sh` → `bindings/kiro/lib/pid.sh`
- `hook-handler/lib/session.sh` → `bindings/kiro/lib/session.sh`
- `hook-handler/lib/truncate.sh` → `bindings/kiro/lib/truncate.sh`
- `hook-handler/lib/validate.sh` → `bindings/kiro/lib/validate.sh` (updated: passes `--harness kiro-cli` to validation package's validate.mjs)
- `hook-handler/lib/init.sh` → `bindings/kiro/lib/init.sh`
- `hook-handler/weaver-log.test.sh` → `bindings/kiro/weaver-log.test.sh`
- `hook-handler/test/` → `bindings/kiro/test/` (truncation.sh, validation.sh, session.sh, helpers.sh)
- `hook-handler/prompts/` → `bindings/kiro/prompts/`
- `hook-handler/src/sync/sync-entry.ts` → `bindings/kiro/src/sync/sync-entry.ts`
- `hook-handler/src/__test-helpers__/spawn.ts` → `bindings/kiro/src/__test-helpers__/spawn.ts` (kiro-specific spawn helper)

New files in `bindings/kiro/`:
- `bindings/kiro/src/adapter.ts`: `HarnessAdapter` implementation for kiro-cli (exports `kiroAdapter`)
  - `name: "kiro-cli"`
  - `processName: "kiro-cli"`
  - `providesSessionId: false`
  - `parseEvent()`: converts kiro-cli `HookEventData` into `WeaverEvent`
  - `globalConfigDir()`: returns `~/.kiro`
  - `skillSearchPaths()`: returns `.kiro/skills/` paths (workspace + global)
  - `cleanupSession()`: deletes marker file via `sessionMarkerPath(session.pid)`
  - `syncConfig()`: calls `syncAgentTimeouts` (moved from shared in Step 5)
- `bindings/kiro/src/log-event.ts`: CLI entry point (fire-and-forget). Imports `parseEvent` from local adapter, parses raw event, appends `WeaverEvent` to JSONL, notifies server.
- `bindings/kiro/src/paths.ts`: `globalKiroDir()`, `globalSkillsPath()` (moved from shared in Step 6)
- `bindings/kiro/src/index.ts`: barrel export

The `weaver-log.sh` flow after refactor:
```bash
EVENT=$(cat)
manage_session  # bash: PID resolution, marker files
# Fire-and-forget: log canonical event
node "$BINDING_DIR/dist/log-event.mjs" --raw "$EVENT" --session-id "$SESSION_ID" &
# Blocking: run validation (resolves validation package dist relative to monorepo root)
run_init
run_validation  # calls node "$ROOT_DIR/validation/dist/validate.mjs" --harness kiro-cli ...
exit $?
```

The `tsdown.config.ts` for the kiro binding has two entry points: `log-event.ts` and `sync-entry.ts`.

Dependencies: Step 1, Step 2, Step 3.

### Step 5: Move kiro-cli sync logic into `bindings/kiro/`

- Move `shared/sync/patch-agent-config.ts` into `bindings/kiro/src/sync/`
- Move `shared/sync/sync.ts` (the `syncAgentTimeouts` function) into `bindings/kiro/src/sync/`
- Move associated tests (`sync.test.ts`, `patch-agent-config.test.ts`, `__test-helpers__/sync-helpers.ts`)
- Keep `shared/sync/project-config.ts`, `shared/sync/timeout-calc.ts`, `shared/sync/validation.ts`, `shared/sync/schemas.ts`, and `shared/sync/types.ts` in `shared/` (harness-agnostic: read `.weaver.json` and calculate timeouts)
- Update `shared/sync/index.ts` to remove kiro-specific exports (`syncAgentTimeouts`, `patchAgentConfig`)
- Update `cli/src/commands/sync.ts` to import from `@weaver/binding-kiro` instead of `@weaver/shared/sync`
- Update `bindings/kiro/src/sync/sync-entry.ts` to import from the local sync module

Dependencies: Step 4.

### Step 6: Move kiro-cli paths and skill resolver into `bindings/kiro/`

- Move `globalKiroDir()` and `globalSkillsPath()` from `shared/paths/paths.ts` into `bindings/kiro/src/paths.ts`
- Update `shared/paths/paths.ts` to remove kiro-specific exports; keep all `~/.weaver/` paths and `sessionMarkerPath` (Weaver-level PID fallback)
- Update `shared/paths/index.ts` accordingly
- Move `server/src/services/skill-resolver/kiro-paths.ts` into `bindings/kiro/src/skills/`
- Move `server/src/services/skill-resolver/agent-config.ts` into `bindings/kiro/src/skills/`
- Move associated tests (`kiro-paths.test.ts`, `agent-config.test.ts`)
- Update `server/src/services/skill-resolver/resolve-configured.ts` to accept skill search paths from the adapter instead of calling `kiroSearchPaths()` directly
- Update `server/src/services/skill-graph/discover.ts`: remove the hardcoded `globalSkillsPath()` call. The caller provides all paths via the adapter's `skillSearchPaths()`. `discoverSkills` no longer appends the global path itself.

Dependencies: Step 4.

### Step 7: Create Claude Code binding skeleton

- Create `bindings/claude-code/src/adapter.ts` implementing `HarnessAdapter` (exports `claudeCodeAdapter`):
  - `name: "claude-code"`
  - `processName: "claude"`
  - `providesSessionId: true`
  - `parseEvent()`: maps Claude Code JSON to `WeaverEvent`:
    - `session_id` → `sessionId`
    - `hook_event_name` → `eventName` (map PascalCase to `WeaverEventName` enum)
    - `transcript_path` → `transcriptPath`
    - `permission_mode` → `permissionMode`
    - `tool_name` → `toolName`, `tool_input` → `toolInput`, `tool_response` → `toolResponse` (normalize to `{ success, result }`)
    - `cwd` → `cwd`
    - Store full original payload in `raw`
  - `globalConfigDir()`: returns `~/.claude`
  - `skillSearchPaths()`: returns `.claude/skills/` paths (workspace + global)
  - `cleanupSession()`: no-op (no marker files)
  - `syncConfig`: not implemented (follow-up work)
- Create `bindings/claude-code/src/log-event.ts`: CLI entry point (fire-and-forget). Same pattern as kiro: imports local adapter, parses, appends, notifies.
- Create `bindings/claude-code/weaver-log.sh`: entry point shell script
  - Read JSON from STDIN
  - Extract `session_id`, `hook_event_name`, `cwd` from JSON (all provided natively)
  - Resolve PID via process tree walk (needed for CLI commands)
  - On `SessionStart`: create session entry in `sessions.jsonl` with `harness: "claude-code"` and the native `session_id` as the session ID
  - Fire-and-forget: `node log-event.mjs`
  - Blocking: `node validate.mjs --harness claude-code` (for `Stop` and `PostToolUse` events)
- Create `bindings/claude-code/lib/session.sh`: session management (uses native `session_id`, no marker files)
- Create `bindings/claude-code/lib/truncate.sh`: truncation for Claude Code payload shape
- Create `bindings/claude-code/lib/validate.sh`: validation dispatch (passes `--harness claude-code`)
- Create `bindings/claude-code/src/index.ts`: barrel export
- Write unit tests for `parseEvent()` covering: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd`

The `tsdown.config.ts` for the Claude Code binding has one entry point: `log-event.ts`.

Dependencies: Step 1, Step 2, Step 3.

### Step 8: Update server to use adapter registry

- Update `shared/types/session.ts`: add `harness: Harness` field to `Session` interface (defaults to `Harness.KIRO_CLI` for backward compatibility during migration)
- Refactor `server/src/services/storage/lifecycle.ts`:
  - `isProcessRunning(pid, processName)` becomes Weaver-level: checks PID alive + process args contain `processName`
  - `startPidPolling` looks up each session's adapter via `getAdapter(session.harness)` and passes `adapter.processName` to `isProcessRunning`
  - `cleanStaleSessions` remains Weaver-level (scans marker files for PID-fallback sessions)
- Refactor `server/src/routes/sessions/delete.ts`: after deleting the log file and removing from the index, calls `adapter.cleanupSession(session)` for harness-specific cleanup (kiro: delete marker file; Claude Code: no-op)
- Refactor skill resolver to accept search paths from the adapter (looked up per-session)
- Update `server/src/index.ts` to register adapters at startup:
  ```typescript
  import { registerAdapter } from "@weaver/shared/adapter-registry";
  import { kiroAdapter } from "@weaver/binding-kiro";
  import { claudeCodeAdapter } from "@weaver/binding-claude-code";
  registerAdapter(kiroAdapter);
  registerAdapter(claudeCodeAdapter);
  ```

Dependencies: Step 6, Step 7.

### Step 9: Update CLI and bin scripts

- Update `bin/weaver` to detect which harness is running (check process tree for `kiro-cli` vs `claude` process names) and pass the harness type as an arg
- Update `cli/src/index.ts` help text to be harness-agnostic (replace "kiro-cli session" with "session")
- Update `cli/src/commands/sync.ts` to use the appropriate binding's sync function based on detected harness (import both bindings, register adapters, look up by harness name)

Dependencies: Step 5, Step 8.

### Step 10: Update log parser for canonical events

- Update `server/src/services/log-parser/parse.ts` to handle `WeaverEvent` (flat structure: `event.eventName` instead of `event.event.hook_event_name`)
- The parser expects the new canonical format only. Old-format entries (missing `eventName` or `harness` fields) are gracefully skipped with a log warning.
- Update `server/src/services/log-parser/group-turns.ts`: `event.eventName` instead of `event.event.hook_event_name`, `event.prompt` instead of `event.event.prompt`
- Update `server/src/services/log-parser/tool-calls.ts`: `event.eventName`, `event.toolName`, `event.toolInput`, `event.toolResponse`
- Update `server/src/services/log-parser/activity.ts`: use `WeaverEventName` enum values
- Update `server/src/services/log-parser/types.ts`: remove `ValidationHookEventData` and `isValidationEvent`, replace with canonical equivalents using `WeaverEvent` fields
- Update `server/src/services/webhook/context.ts`: use flat event field names
- Update `server/src/routes/sessions/sessions.ts`: use flat event field names
- Update all log-parser tests and test fixtures

Dependencies: Step 1, Step 8.

### Step 11: Update client type imports

The `@deprecated` type aliases mean most client files compile without changes. Only code accessing the nested `event.event.hook_event_name` structure needs updating.

- Update `client/src/pages/SessionDetailPage/components/TurnContainer.tsx`: `turn.events[0]?.eventName` instead of `turn.events[0]?.event.hook_event_name`
- Update `client/src/pages/SessionDetailPage/SessionDetailPage.test.tsx`: update test fixtures from nested to flat event shape
- Verify all client tests pass

Dependencies: Step 1, Step 10.

### Step 12: Create migration script

Create a one-time migration script to backfill existing JSONL files with the new canonical format. Run manually by the user.

- Create `scripts/migrate-v2.ts`
- The script reads `~/.weaver/sessions.jsonl` and adds `"harness": "kiro-cli"` to each entry
- The script reads each `~/.weaver/logs/<session-id>.jsonl` and converts old-format `HookEvent` entries (`{ timestamp, pid?, event: { hook_event_name, ... } }`) to canonical `WeaverEvent` entries (`{ sessionId, timestamp, harness: "kiro-cli", eventName, ... }`)
- The script reads `~/.weaver/logs/orphan.jsonl` and converts entries similarly (using `"orphan"` as `sessionId`)
- Uses atomic writes (write to temp file, rename) to avoid data loss on interruption
- Validates output count matches input count before replacing files
- Prints a summary of converted files and any skipped entries
- Idempotent: can be re-run safely (already-converted entries are detected and left unchanged)
- Run via `npx tsx scripts/migrate-v2.ts`

Dependencies: Step 1.

### Step 13: Update Electron packaging

Update the desktop package to bundle binding and validation dists, and install hook script symlinks.

- Add to `desktop/package.json` `extraResources`:
  ```json
  { "from": "../bindings/kiro", "to": "bindings/kiro" },
  { "from": "../bindings/claude-code", "to": "bindings/claude-code" },
  { "from": "../validation/dist", "to": "validation/dist" }
  ```
- Create `desktop/src/install-hooks.ts` (similar to `install-cli.ts`): creates symlinks for each binding's `weaver-log.sh` into the appropriate hook directories (e.g., `~/.config/amazonq/global/hooks/weaver-log.sh` for kiro)
- Update `desktop/src/main.ts` to call `installHooks()` on startup
- Shell scripts resolve paths relative to their real location (following symlinks into the app bundle), using `$BINDING_DIR` for own dist and `$ROOT_DIR` for validation dist
- Test `npm run app` and `npm run dist` after changes

Dependencies: Steps 4, 7, 8.

### Step 14: Remove old hook-handler package

Once all references point to `bindings/kiro/`, `bindings/claude-code/`, and `validation/`, remove the now-empty `hook-handler/` workspace.

- Remove `hook-handler/` directory
- Remove from root `package.json` workspaces
- Update any remaining imports
- Run full test suite

Dependencies: Steps 3-13.

## Files to modify/create

### New files

| File | Description |
|------|-------------|
| `shared/types/weaver-event.ts` | Canonical `WeaverEvent` type and `WeaverEventName` enum (`UPPER_SNAKE_CASE` keys) |
| `shared/types/harness.ts` | `Harness` enum and `HarnessAdapter` interface |
| `shared/adapter-registry.ts` | Adapter registry: `registerAdapter()`, `getAdapter()` backed by `Map<string, HarnessAdapter>` |
| `validation/package.json` | Package config for validation (`@weaver/validation`) |
| `validation/tsconfig.json` | TypeScript config |
| `validation/tsdown.config.ts` | Build config (entry points: `validate.ts`, `inject.ts`) |
| `validation/vitest.config.ts` | Test config |
| `validation/src/validate.ts` | CLI entry point: registers adapters, accepts `--harness`, runs validation |
| `validation/src/inject/` | Prompt injection (inject.ts entry point, run-inject/, formatting.ts) |
| `validation/src/run-validation/` | Validation runner (run-validation.ts, stop-trigger.ts, post-tool-use-trigger.ts, parse-args.ts) |
| `validation/src/stop-hook/` | Single stop hook execution (stop-hook.ts) |
| `validation/src/commands.ts` | substituteVars, runCommand |
| `validation/src/glob.ts` | Extension-based file matching |
| `validation/src/exit.ts` | Exit logic, pending file writes |
| `validation/src/logging.ts` | Writes canonical `WeaverEvent` validation entries to session JSONL |
| `validation/src/scope/` | Test directory resolution (resolveTestDirs) |
| `validation/src/session-analysis/` | Changed file extraction, agent-tested dir extraction (parses `WeaverEvent`) |
| `validation/src/config/` | find-config, test-runners, project-config re-export |
| `validation/src/utils/logger.ts` | Logger tagged `"validation"` |
| `validation/src/__test-helpers__/` | Shared test fixtures and mocks |
| `validation/src/index.ts` | Barrel export |
| `bindings/kiro/package.json` | Package config (`@weaver/binding-kiro`) |
| `bindings/kiro/tsconfig.json` | TypeScript config |
| `bindings/kiro/tsdown.config.ts` | Build config (entry points: `log-event.ts`, `sync-entry.ts`) |
| `bindings/kiro/vitest.config.ts` | Test config |
| `bindings/kiro/weaver-log.sh` | Hook entry script (moved from hook-handler) |
| `bindings/kiro/weaver-log.test.sh` | Shell script tests (moved from hook-handler) |
| `bindings/kiro/test/` | Shell integration tests (truncation.sh, validation.sh, session.sh, helpers.sh) |
| `bindings/kiro/lib/pid.sh` | PID resolution |
| `bindings/kiro/lib/session.sh` | Session management (marker files) |
| `bindings/kiro/lib/truncate.sh` | Response truncation (kiro payload shape) |
| `bindings/kiro/lib/validate.sh` | Validation dispatch (passes `--harness kiro-cli` to validation package) |
| `bindings/kiro/lib/init.sh` | Init dispatch (sync on agentSpawn) |
| `bindings/kiro/prompts/` | fix-validation.md (moved from hook-handler) |
| `bindings/kiro/src/adapter.ts` | `HarnessAdapter` implementation for kiro-cli |
| `bindings/kiro/src/log-event.ts` | CLI entry point: parse raw event, append WeaverEvent to JSONL, notify server |
| `bindings/kiro/src/paths.ts` | `globalKiroDir()`, `globalSkillsPath()` |
| `bindings/kiro/src/sync/` | `syncAgentTimeouts`, `patchAgentConfig` (moved from shared) |
| `bindings/kiro/src/skills/` | `kiroSearchPaths`, `loadAgentConfig` (moved from server) |
| `bindings/kiro/src/index.ts` | Barrel export |
| `bindings/claude-code/package.json` | Package config (`@weaver/binding-claude-code`) |
| `bindings/claude-code/tsconfig.json` | TypeScript config |
| `bindings/claude-code/tsdown.config.ts` | Build config (entry point: `log-event.ts`) |
| `bindings/claude-code/vitest.config.ts` | Test config |
| `bindings/claude-code/weaver-log.sh` | Hook entry script for Claude Code |
| `bindings/claude-code/lib/session.sh` | Session management (uses native session_id) |
| `bindings/claude-code/lib/truncate.sh` | Response truncation (Claude Code payload shape) |
| `bindings/claude-code/lib/validate.sh` | Validation dispatch (passes `--harness claude-code`) |
| `bindings/claude-code/src/adapter.ts` | `HarnessAdapter` implementation for Claude Code |
| `bindings/claude-code/src/log-event.ts` | CLI entry point: parse raw event, append WeaverEvent to JSONL, notify server |
| `bindings/claude-code/src/index.ts` | Barrel export |
| `scripts/migrate-v2.ts` | One-time manual migration script |
| `desktop/src/install-hooks.ts` | Symlink installation for hook scripts in packaged app |

### Modified files

| File | Description |
|------|-------------|
| `package.json` | Add `bindings/kiro`, `bindings/claude-code`, `validation` to workspaces; remove `hook-handler` |
| `shared/types/index.ts` | Export new canonical types and `Harness` enum |
| `shared/types/events.ts` | Add `@deprecated` type aliases: `HookEvent` → `WeaverEvent`, `HookEventName` → `WeaverEventName` |
| `shared/types/session.ts` | Add `harness: Harness` field to `Session` interface |
| `shared/paths/paths.ts` | Remove `globalKiroDir()`, `globalSkillsPath()`; keep `sessionMarkerPath` (Weaver-level fallback) |
| `shared/paths/index.ts` | Remove kiro-specific exports |
| `shared/sync/index.ts` | Remove `syncAgentTimeouts`, `patchAgentConfig` exports |
| `shared/sync/sync.ts` | Remove (moved to bindings/kiro) |
| `shared/sync/patch-agent-config.ts` | Remove (moved to bindings/kiro) |
| `shared/sync/sync.test.ts` | Remove (moved to bindings/kiro) |
| `shared/sync/patch-agent-config.test.ts` | Remove (moved to bindings/kiro) |
| `shared/package.json` | Add `adapter-registry` export |
| `server/src/services/storage/lifecycle.ts` | `isProcessRunning` becomes Weaver-level (accepts `processName`); PID polling looks up adapter per session |
| `server/src/routes/sessions/delete.ts` | Call `adapter.cleanupSession(session)` instead of hardcoded `sessionMarkerPath` |
| `server/src/services/skill-resolver/resolve-configured.ts` | Accept skill paths from adapter |
| `server/src/services/skill-resolver/kiro-paths.ts` | Remove (moved to bindings/kiro) |
| `server/src/services/skill-resolver/agent-config.ts` | Remove (moved to bindings/kiro) |
| `server/src/services/skill-graph/discover.ts` | Remove hardcoded `globalSkillsPath()`; caller provides all paths via adapter |
| `server/src/services/log-parser/parse.ts` | Handle flat `WeaverEvent` format; skip old-format entries |
| `server/src/services/log-parser/group-turns.ts` | `event.eventName` instead of `event.event.hook_event_name` |
| `server/src/services/log-parser/tool-calls.ts` | `event.toolName`, `event.toolInput`, `event.toolResponse` |
| `server/src/services/log-parser/activity.ts` | Use `WeaverEventName` enum values |
| `server/src/services/log-parser/types.ts` | Replace `ValidationHookEventData` with canonical equivalent |
| `server/src/services/webhook/context.ts` | Use flat event field names |
| `server/src/routes/sessions/sessions.ts` | Use flat event field names for activity derivation |
| `server/src/index.ts` | Register adapters at startup |
| `cli/src/index.ts` | Harness-agnostic help text |
| `cli/src/commands/sync.ts` | Import sync from binding based on detected harness |
| `bin/weaver` | Detect harness type from process tree, pass as arg |
| `client/src/pages/SessionDetailPage/components/TurnContainer.tsx` | `event.eventName` instead of `event.event.hook_event_name` |
| `client/src/pages/SessionDetailPage/SessionDetailPage.test.tsx` | Update test fixtures to flat event shape |
| `desktop/package.json` | Add bindings and validation to `extraResources` |
| `desktop/src/main.ts` | Call `installHooks()` on startup |

### Removed files/directories

| Path | Reason |
|------|--------|
| `hook-handler/` | Entire package split into `bindings/kiro/`, `bindings/claude-code/`, and `validation/` |
| `shared/sync/sync.ts` | Moved to `bindings/kiro/src/sync/` |
| `shared/sync/patch-agent-config.ts` | Moved to `bindings/kiro/src/sync/` |
| `server/src/services/skill-resolver/kiro-paths.ts` | Moved to `bindings/kiro/src/skills/` |
| `server/src/services/skill-resolver/agent-config.ts` | Moved to `bindings/kiro/src/skills/` |

## Testing strategy

### Development workflow: Complex (ATDD + BDD + TDD)

Rationale: Cross-package restructuring with new type contracts and zero-regression requirement.

### Level 1: Acceptance criteria (ATDD)

| # | Criterion | Verification |
|---|-----------|-------------|
| AC1 | Existing kiro-cli sessions produce identical log output (after migration) | Compare JSONL output before/after refactor for a sample session |
| AC2 | `npm test` passes across all packages with no test modifications | CI green |
| AC3 | `npm run build` succeeds for all packages including new bindings and validation | CI green |
| AC4 | `weaver sync` still patches `.kiro/agents/*.json` correctly | Existing sync tests pass from new location |
| AC5 | Dashboard renders existing session logs without changes | Manual verification + existing client tests |
| AC6 | Claude Code binding parses sample hook payloads into valid `WeaverEvent` objects | Unit tests in `bindings/claude-code/` |
| AC7 | No `import` in `server/`, `client/`, or `cli/` references `kiro-paths`, `kiro-cli`, or `hook-handler` directly | Grep verification |
| AC8 | Migration script converts existing sessions.jsonl and event logs to canonical format | Script test with fixture data |
| AC9 | Validation package's `validate.ts` entry point works with `--harness kiro-cli` and `--harness claude-code` | Integration tests |
| AC10 | `npm run app` and `npm run dist` succeed with new package structure | Manual verification |

### Level 2: Behavioral scenarios (BDD)

**Scenario: kiro-cli stop event flows through the new architecture**
- Given a raw kiro-cli `stop` hook payload on STDIN
- When the kiro binding's `weaver-log.sh` processes it
- Then `log-event.mjs` writes a `WeaverEvent` with `eventName: WeaverEventName.STOP` and `harness: Harness.KIRO_CLI` to the session JSONL (fire-and-forget)
- And `validate.mjs --harness kiro-cli` runs validation commands from `.weaver.json`
- And validation results are written as a canonical `WeaverEvent` with `eventName: WeaverEventName.VALIDATION`

**Scenario: Claude Code PostToolUse event is parsed**
- Given a raw Claude Code `PostToolUse` JSON payload with `session_id`, `tool_name`, `tool_input`, `tool_response`
- When the Claude Code adapter's `parseEvent()` is called
- Then a `WeaverEvent` with `eventName: WeaverEventName.POST_TOOL_USE`, `sessionId` matching the native `session_id`, and `toolName`/`toolInput`/`toolResponse` populated is returned

**Scenario: Process detection uses adapter's processName**
- Given two sessions: one with `harness: Harness.KIRO_CLI` and one with `harness: Harness.CLAUDE_CODE`
- When the server checks if each session is alive
- Then the Weaver-level `isProcessRunning` checks for `"kiro-cli"` in process args for the kiro session
- And checks for `"claude"` in process args for the Claude Code session

**Scenario: Old-format log entries are gracefully skipped**
- Given a session log containing old-format `HookEvent` entries (pre-migration)
- When the log parser reads the file
- Then old-format entries are skipped without error
- And a warning is logged for each skipped entry

**Scenario: Sync command uses the correct binding**
- Given a kiro-cli session running `weaver sync`
- When the sync command executes
- Then `.kiro/agents/*.json` files are patched (not `.claude/` files)

**Scenario: Skill discovery uses adapter-provided paths**
- Given a session with `harness: Harness.KIRO_CLI`
- When skill discovery runs
- Then it searches `.kiro/skills/` (workspace + global) paths returned by the kiro adapter
- And does NOT hardcode `globalSkillsPath()`

**Scenario: Claude Code SessionStart creates a session**
- Given a raw Claude Code `SessionStart` JSON payload with `session_id`
- When the Claude Code hook-handler processes it
- Then a session entry with `harness: Harness.CLAUDE_CODE` and the native `session_id` as the session ID is appended to `sessions.jsonl`
- And a log file is created at `~/.weaver/logs/<session_id>.jsonl`

**Scenario: Session deletion uses adapter cleanup**
- Given a kiro-cli session with a marker file
- When the session is deleted via the API
- Then the log file is deleted (Weaver-level)
- And `kiroAdapter.cleanupSession()` deletes the marker file
- And the session is removed from the index

**Scenario: Validation entry point resolves adapter via registry**
- Given the validation package's `validate.ts` is called with `--harness kiro-cli`
- When it starts up
- Then it registers both kiro and claude-code adapters
- And looks up the kiro adapter via `getAdapter("kiro-cli")`
- And uses `kiroAdapter.parseEvent()` if event parsing is needed

### Level 3: Unit tests (TDD)

| Unit | What to test |
|------|-------------|
| `WeaverEvent` type guards | Validate that type narrowing works for each event name |
| `shared/adapter-registry.ts` | Registry returns correct adapter by name, throws for unknown harness, handles duplicate registration |
| `bindings/kiro/src/adapter.ts` `parseEvent()` | Each kiro-cli event type maps correctly to `WeaverEvent` |
| `bindings/claude-code/src/adapter.ts` `parseEvent()` | Each Claude Code event type maps correctly, including `transcriptPath`, `permissionMode` |
| `validation/src/run-validation/` | All existing validation tests pass from new location |
| `validation/src/session-analysis/` | Changed file extraction works with canonical `WeaverEvent` format |
| `validation/src/logging.ts` | Writes canonical `WeaverEvent` entries (not old `HookEvent` format) |
| `validation/src/scope/` | All existing scope tests pass from new location |
| `validation/src/config/` | All existing config tests pass from new location |
| `validation/src/inject/` | All existing inject tests pass from new location |
| `bindings/kiro/src/sync/` | All existing sync tests pass from new location |
| `bindings/kiro/src/skills/` | All existing skill resolver tests pass from new location |
| `scripts/migrate-v2.ts` | Converts old-format entries, handles orphan.jsonl, uses atomic writes, validates counts |

## Risks and mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Import path breakage across packages | Build failures | Run `npm run build` after each step; fix imports incrementally |
| Existing session logs become unreadable | Data loss for users | Manual migration script converts old format; parser skips unrecognized entries gracefully |
| Turborepo cache invalidation | Slow builds during migration | Clear `.turbo/cache` once after restructuring |
| Circular dependencies between packages | Build failures | Dependency direction: bindings → shared, validation → bindings + shared, server → bindings + shared. Never the reverse. |
| Claude Code hook protocol changes | Binding breaks | Keep `raw` field on `WeaverEvent` for debugging; adapter tests use fixture payloads from docs |
| Desktop/Electron packaging breaks | App won't launch | Test `npm run app` and `npm run dist` after Step 13 |
| Multi-harness server: wrong adapter selected | Incorrect process detection, wrong skill paths | Adapter registry keyed by `session.harness`; default to `Harness.KIRO_CLI` for sessions without a harness field |
| Shell script path resolution in packaged app | Hook scripts can't find validation dist | Shell scripts follow symlinks to real location, resolve monorepo root via `$BINDING_DIR/../..` |
| Validation package imports all bindings | Coupling | Acceptable: adding a new harness requires one import + one `registerAdapter` call. Rare event. |

### Rollback strategy

Each step is independently committable. If a step introduces regressions:
1. Revert the commit
2. The previous step's state is fully functional
3. The migration script is idempotent (can be re-run safely)

### Monitoring and observability

- Existing Weaver app-logs capture errors during event processing
- Add a `harness` field to app-log entries so issues can be attributed to a specific binding
- The `raw` field on `WeaverEvent` preserves the original payload for debugging adapter issues
- Parser logs a warning for each skipped old-format entry (aids in identifying unmigrated data)

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Claude Code hooks documentation | External | Used to build the Claude Code adapter's event parsing. URL: https://code.claude.com/docs/en/hooks |
| No team dependencies | - | This is a solo refactor |
| No infrastructure changes | - | All changes are local package structure |
| No new npm dependencies | - | Uses existing deps (zod, vitest, tsdown, typescript) |
