# Claude Code Feature Parity: Implementation Plan

## Overview

Complete the Claude Code integration layer for Weaver. The data model and event parsing (adapter, `log-event.ts`, 15 unit tests) are done as of v1.6.0. This plan covers the remaining integration glue: the hook shell script, session management, desktop hook installation, auto-configuration, agent config loading, init/sync on session start, and E2E tests.

### Success Criteria

- Claude Code sessions appear in the Weaver dashboard with correct metadata (session ID, agent name, cwd, harness)
- Events flow end-to-end: Claude Code hook fires, shell script captures stdin, `log-event.mjs` writes canonical JSONL, server is notified
- Validation runs on `Stop` and `PostToolUse` events identically to kiro-cli
- Session resume (`SessionStart` on an existing session ID) updates the existing session entry rather than creating a duplicate
- Desktop app installs the Claude Code hook symlink on launch
- Auto-config patches `.claude/settings.json` (project + global) with Weaver hook entries
- `loadAgentConfig` reads Claude Code agent markdown files and resolves configured skills
- Timeout syncing patches Claude Code hook entries with calculated timeouts
- Setup documentation covers Claude Code configuration

### Assumptions and Constraints

- Claude Code provides `session_id` natively in every hook event payload (confirmed via docs)
- Claude Code hooks are configured in `.claude/settings.json` under a `hooks` key with PascalCase event names
- Claude Code agents are markdown files with YAML frontmatter at `.claude/agents/*.md`
- The `gray-matter` package is already available in the server package and can be added to the claude-code binding
- Cherrypick is kiro-cli only (already reflected in the UI)
- macOS is the only supported platform (consistent with existing desktop app constraint)

## Approach

### High-Level Solution Design

The implementation mirrors kiro's binding architecture: a shell script orchestrates the lifecycle, lib helpers handle discrete concerns (session, PID, validation, truncation, init), and TypeScript entry points handle event normalization and config syncing. The key architectural difference is that Claude Code provides native session IDs, eliminating the need for PID-based marker files.

### Key Architectural Decisions

1. **Session dedup via append + dedup-on-read (Option B):** The shell script always appends to `sessions.jsonl`. `readSessions` deduplicates by session ID (last entry wins). This avoids concurrent read-modify-write between the shell and server processes. The server's existing `writeSessions` calls naturally compact duplicates on the next mutation.

2. **Validation trigger normalization in `parse-args.ts`:** Rather than mapping PascalCase to camelCase in the shell script, `parse-args.ts` normalizes the trigger value. The shell script passes the native event name (`Stop`, `PostToolUse`), and the system normalizes it to the canonical form (`stop`, `postToolUse`). This keeps the shell script simple and the normalization centralized.

3. **`loadAgentConfig` parses YAML frontmatter:** Claude Code agents are markdown files with YAML frontmatter. The adapter's `loadAgentConfig` reads the `.md` file, parses the frontmatter with `gray-matter`, and returns the result. `resolveConfiguredSkills` is extended to check for a `skills` key (direct name array) in addition to the existing `resources` key (skill:// URIs).

4. **Auto-config patches settings.json:** A `sync-entry.mjs` equivalent for Claude Code reads `.weaver.json`, builds the hooks configuration, and patches `.claude/settings.json` at both project and global levels. Timeout values are converted from milliseconds to seconds (Claude Code uses seconds).

5. **Agent name extracted from process args:** The shell script uses the same `ps -p $PID -o args=` approach as kiro to extract `--agent <name>` from the Claude Code process.

### Alternative Approaches Considered

- **Option A for session resume (shell-side rewrite):** Rejected due to race condition risk between shell and server writing to the same file.
- **Manual hook configuration only:** Rejected per user preference for auto-patching.
- **Shell-side trigger normalization:** Rejected in favor of centralizing normalization in `parse-args.ts`.

### Development Workflow

This is a **complex** task: cross-module integration (shell scripts, TypeScript adapters, server, desktop, validation), new state management (session dedup), multiple failure modes (orphan routing, concurrent writes, process tree resolution), and spans 6+ packages.

**Levels: ATDD + BDD + TDD (all three)**

- ATDD: end-to-end acceptance tests verifying the full event flow
- BDD: behavioral scenarios for session management (create, resume, orphan), validation dispatch, auto-config patching
- TDD: unit-level Red-Green-Refactor for `loadAgentConfig`, frontmatter parsing, session dedup logic, trigger normalization, timeout conversion

## Implementation Steps

### Step 1: Session dedup in `readSessions` (server)

Add dedup-by-ID logic to `readSessions` so that when multiple entries exist for the same session ID, the last entry wins. This is a prerequisite for the Claude Code session resume flow.

**Files:**
- `server/src/services/storage/sessions.ts`: after parsing JSONL lines, deduplicate by `id` (last entry wins)
- `server/src/services/storage/sessions.test.ts`: add test for dedup behavior

**Deliverable:** `readSessions` returns at most one entry per session ID, preferring the latest.

---

### Step 2: Validation trigger normalization

Extend `parse-args.ts` to normalize PascalCase trigger values from Claude Code to the camelCase values the validation pipeline expects.

**Mapping:**
- `Stop` -> `stop`
- `PostToolUse` -> `postToolUse`
- `UserPromptSubmit` -> `userPromptSubmit`

**Files:**
- `validation/src/run-validation/parse-args.ts`: add a `TRIGGER_MAP` that normalizes PascalCase to camelCase
- `validation/src/run-validation/parse-args.test.ts`: add tests for PascalCase trigger inputs

**Deliverable:** `parseArgs` accepts both `Stop` and `stop`, returning the canonical camelCase form.

---

### Step 3: Skill resolver support for `skills` key

Extend `resolveConfiguredSkills` to handle Claude Code's `skills: ["skill-name"]` format in addition to kiro's `resources: ["skill://..."]` format.

**Files:**
- `server/src/services/skill-resolver/resolve-configured.ts`: in `resolveCustomAgentSkills`, check for `config.skills` (string array of skill directory names) and return them directly
- `server/src/services/skill-resolver/resolve-configured.test.ts`: add tests for the `skills` key path

**Deliverable:** When `loadAgentConfig` returns `{ skills: ["coding-practices", "testing"] }`, the resolver returns those names directly.

---

### Step 4: `loadAgentConfig` for Claude Code

Implement `loadAgentConfig` on the Claude Code adapter. Reads `.claude/agents/<name>.md` from workspace then global, parses YAML frontmatter with `gray-matter`, and returns the frontmatter object.

**Files:**
- `bindings/claude-code/src/skills/agent-config.ts` (new): `loadAgentConfig(agentName, cwd)` function
- `bindings/claude-code/src/skills/agent-config.test.ts` (new): unit tests
- `bindings/claude-code/src/adapter.ts`: import and attach `loadAgentConfig` to the adapter
- `bindings/claude-code/src/adapter.test.ts`: add test for `loadAgentConfig` on the adapter
- `bindings/claude-code/src/index.ts`: export if needed
- `bindings/claude-code/package.json`: add `gray-matter` dependency

**Search paths (in order):**
1. `<cwd>/.claude/agents/<name>.md`
2. `~/.claude/agents/<name>.md`

**Deliverable:** `claudeCodeAdapter.loadAgentConfig("dev", "/project")` returns parsed frontmatter or null.

---

### Step 5: Hook shell script and lib helpers

Create `bindings/claude-code/weaver-log.sh` and supporting lib scripts. This is the core integration piece.

**New files:**
- `bindings/claude-code/weaver-log.sh`: main entry point
- `bindings/claude-code/lib/pid.sh`: PID resolution (walk process tree to find `claude` process)
- `bindings/claude-code/lib/session.sh`: session management using native `session_id`
- `bindings/claude-code/lib/truncate.sh`: truncate large tool responses (reuse kiro's jq logic)
- `bindings/claude-code/lib/validate.sh`: validation dispatch with `--harness claude-code`
- `bindings/claude-code/lib/init.sh`: session initialization (runs sync on `SessionStart`)

**Key differences from kiro:**

`weaver-log.sh`:
- Extracts `session_id` from the event JSON (not generated)
- Uses `SESSION_ID` from the event payload for all operations
- Triggers session creation on `SessionStart` (not `agentSpawn`)

`session.sh`:
- On `SessionStart`: always append a session entry to `sessions.jsonl` with the native `session_id`, `harness: "claude-code"`, and extracted agent name
- On all other events: read `session_id` from the event JSON directly (no marker files)
- If `session_id` is missing: route to orphan
- Agent name extraction: `ps -p $PID -o args=`, look for `--agent <name>`

`pid.sh`:
- Same process tree walk as kiro, but `processName` check looks for `claude` instead of `kiro`

`validate.sh`:
- Passes `--harness claude-code` to the validation script
- Dispatches on PascalCase event names: `Stop`, `PostToolUse`, `UserPromptSubmit`

`init.sh`:
- Triggers on `SessionStart` (not `agentSpawn`)
- Runs `sync-entry.mjs` with `--cwd`

`truncate.sh`:
- Identical to kiro's implementation (same jq logic for `tool_response.result`)

**Deliverable:** A working shell script that handles the full Claude Code hook lifecycle.

---

### Step 6: Auto-config and timeout syncing

Create the sync mechanism for Claude Code that patches `.claude/settings.json` with Weaver hook entries and calculated timeouts.

**New files:**
- `bindings/claude-code/src/sync/sync-entry.ts`: CLI entry point (reads `--cwd`, calls `syncClaudeCodeHooks`)
- `bindings/claude-code/src/sync/sync.ts`: reads `.weaver.json`, calculates timeouts, patches settings files
- `bindings/claude-code/src/sync/patch-settings.ts`: reads a `.claude/settings.json`, adds/updates Weaver hook entries with correct timeouts
- `bindings/claude-code/src/sync/patch-settings.test.ts`: unit tests for patching logic
- `bindings/claude-code/src/sync/sync.test.ts`: unit tests for the sync orchestrator

**Hook entries to add/update in `.claude/settings.json`:**

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "<hook-path>", "timeout": 10 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "<hook-path>", "timeout": 10 }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<hook-path>", "timeout": 10 }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<hook-path>", "timeout": <calculated> }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "<hook-path>", "timeout": <calculated> }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "<hook-path>", "timeout": 10 }] }]
  }
}
```

**Timeout conversion:** kiro uses milliseconds, Claude Code uses seconds. Divide by 1000 and round up.

**Patch targets (feature parity with kiro):**
1. `<cwd>/.claude/settings.json` (project)
2. `~/.claude/settings.json` (global)

**Patch behavior:**
- If the settings file doesn't exist, create it with the hooks section
- If it exists but has no `hooks` key, add it
- If hooks exist, merge Weaver entries (identified by command path containing `weaver-log.sh`)
- Update timeout values on existing Weaver entries if they differ
- Preserve all non-Weaver hook entries

**Build config update:**
- `bindings/claude-code/tsdown.config.ts`: add `src/sync/sync-entry.ts` entry point

**Deliverable:** Running `node sync-entry.mjs --cwd /project` patches settings files with Weaver hooks and correct timeouts.

---

### Step 7: Desktop hook installation

Add the Claude Code binding to the desktop app's hook installer.

**Files:**
- `desktop/src/install-hooks.ts`: add a second entry to the `HOOKS` array

```typescript
const HOOKS: HookEntry[] = [
  { name: "kiro", resourcePath: "bindings/kiro/weaver-log.sh" },
  { name: "claude-code", resourcePath: "bindings/claude-code/weaver-log.sh" },
];
```

**Deliverable:** Desktop app symlinks both hook scripts to `/usr/local/lib/weaver/` on launch.

---

### Step 8: Setup documentation

Add Claude Code setup instructions to `docs/setup.md`.

**Files:**
- `docs/setup.md`: add a `### Claude Code` section after the kiro-cli section

**Content to cover:**
- How the auto-config works (runs on `SessionStart`, patches settings.json)
- Manual setup alternative: JSON snippet for `.claude/settings.json` hooks
- Which features work (logging, validation, session tracking, skill resolution)
- Which features are kiro-cli only (cherrypick)
- Differences in behavior (native session IDs, PascalCase events)

**Deliverable:** Users can follow the docs to set up Claude Code with Weaver.

---

### Step 9: Shell script tests

Create test infrastructure for the Claude Code shell script, mirroring kiro's test structure.

**New files:**
- `bindings/claude-code/weaver-log.test.sh`: test orchestrator
- `bindings/claude-code/test/helpers.sh`: shared assertions (copy from kiro)
- `bindings/claude-code/test/session.sh`: session lifecycle tests (create, resume, orphan)
- `bindings/claude-code/test/truncation.sh`: truncation tests
- `bindings/claude-code/test/validation.sh`: validation dispatch tests

**Key test scenarios:**
- `SessionStart` creates a session entry with native `session_id` and `harness: "claude-code"`
- Second `SessionStart` with same `session_id` appends (dedup verified at read time)
- Events without `session_id` route to orphan
- Agent name extracted from process args
- Truncation of large tool responses
- Validation dispatches on `Stop` and `PostToolUse` with `--harness claude-code`

**Build config update:**
- `bindings/claude-code/package.json`: update test script to include shell tests (`vitest run && bash weaver-log.test.sh`)

**Deliverable:** `bash weaver-log.test.sh` passes all scenarios.

---

### Step 10: E2E tests

Add integration tests that simulate the full Claude Code event flow.

**New files:**
- `e2e/tests/claude-code-hook.spec.ts`: Playwright test that simulates Claude Code hook events

**Test flow:**
1. Seed a Claude Code `SessionStart` event through the shell script
2. Verify session appears in `sessions.jsonl` with `harness: "claude-code"`
3. Send subsequent events (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`)
4. Verify events are written to the session JSONL
5. Verify the server receives notifications (session appears in the dashboard API)
6. Send a second `SessionStart` with the same `session_id` (resume)
7. Verify dedup: `readSessions` returns one entry for that ID

**Deliverable:** E2E test suite validates the full Claude Code integration.

## Files to Modify/Create

### New Files

| File | Description |
|------|-------------|
| `bindings/claude-code/weaver-log.sh` | Main hook shell script: reads stdin, manages session, dispatches to log-event and validation |
| `bindings/claude-code/lib/pid.sh` | PID resolution: walk process tree to find `claude` process |
| `bindings/claude-code/lib/session.sh` | Session management: append on SessionStart, read session_id from event JSON for others |
| `bindings/claude-code/lib/truncate.sh` | Truncate large tool_response.result values |
| `bindings/claude-code/lib/validate.sh` | Validation dispatch with `--harness claude-code` |
| `bindings/claude-code/lib/init.sh` | Session init: run sync-entry.mjs on SessionStart |
| `bindings/claude-code/src/skills/agent-config.ts` | Load Claude Code agent markdown files, parse YAML frontmatter |
| `bindings/claude-code/src/skills/agent-config.test.ts` | Unit tests for agent config loading |
| `bindings/claude-code/src/sync/sync-entry.ts` | CLI entry point for config syncing |
| `bindings/claude-code/src/sync/sync.ts` | Orchestrator: read .weaver.json, calculate timeouts, patch settings |
| `bindings/claude-code/src/sync/sync.test.ts` | Unit tests for sync orchestrator |
| `bindings/claude-code/src/sync/patch-settings.ts` | Patch .claude/settings.json with Weaver hook entries |
| `bindings/claude-code/src/sync/patch-settings.test.ts` | Unit tests for settings patching |
| `bindings/claude-code/weaver-log.test.sh` | Shell test orchestrator |
| `bindings/claude-code/test/helpers.sh` | Shared test assertions |
| `bindings/claude-code/test/session.sh` | Session lifecycle tests |
| `bindings/claude-code/test/truncation.sh` | Truncation tests |
| `bindings/claude-code/test/validation.sh` | Validation dispatch tests |
| `e2e/tests/claude-code-hook.spec.ts` | E2E test: full event flow through shell script |

### Modified Files

| File | Description |
|------|-------------|
| `server/src/services/storage/sessions.ts` | Add dedup-by-ID logic in `readSessions` (last entry wins) |
| `server/src/services/storage/sessions.test.ts` | Add test for session dedup behavior |
| `validation/src/run-validation/parse-args.ts` | Normalize PascalCase triggers (`Stop` -> `stop`, `PostToolUse` -> `postToolUse`) |
| `validation/src/run-validation/parse-args.test.ts` | Add tests for PascalCase trigger normalization |
| `server/src/services/skill-resolver/resolve-configured.ts` | Handle `skills` key (direct name array) in addition to `resources` (skill:// URIs) |
| `server/src/services/skill-resolver/resolve-configured.test.ts` | Add tests for `skills` key resolution |
| `bindings/claude-code/src/adapter.ts` | Import and attach `loadAgentConfig` |
| `bindings/claude-code/src/adapter.test.ts` | Add test verifying `loadAgentConfig` is present on adapter |
| `bindings/claude-code/src/index.ts` | Re-export new modules if needed |
| `bindings/claude-code/package.json` | Add `gray-matter` dependency, update test script |
| `bindings/claude-code/tsdown.config.ts` | Add `sync-entry.ts` build entry point |
| `desktop/src/install-hooks.ts` | Add claude-code entry to `HOOKS` array |
| `docs/setup.md` | Add Claude Code setup section |

## Testing Strategy

### Complexity Assessment

**Complex task** (cross-module integration, new state management, multiple failure modes, 6+ packages).

**Levels: ATDD + BDD + TDD**

### Level 1: ATDD (Acceptance Tests)

Acceptance criteria from the user's perspective:

1. **AC1:** A Claude Code `SessionStart` event piped to `weaver-log.sh` creates a session entry in `sessions.jsonl` with `harness: "claude-code"` and the native `session_id`.
2. **AC2:** Subsequent events (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`) are logged to the correct session JSONL file.
3. **AC3:** A resumed session (`SessionStart` with an existing `session_id`) does not create a duplicate session in the dashboard.
4. **AC4:** Events arriving without a `session_id` are routed to the orphan log.
5. **AC5:** Validation runs on `Stop` and `PostToolUse` events with `--harness claude-code`.
6. **AC6:** The desktop app symlinks `weaver-log.sh` for Claude Code on launch.
7. **AC7:** Auto-config patches `.claude/settings.json` with Weaver hook entries at both project and global scope.
8. **AC8:** `loadAgentConfig("dev", cwd)` returns parsed frontmatter from `.claude/agents/dev.md`.
9. **AC9:** Configured skills from a Claude Code agent's `skills` frontmatter appear in the session detail view.

These are validated by the E2E tests (`e2e/tests/claude-code-hook.spec.ts`) and shell tests (`weaver-log.test.sh`).

### Level 2: BDD (Behavioral Scenarios)

**Session management:**
- Given a `SessionStart` event with `session_id: "abc"`, When piped to `weaver-log.sh`, Then `sessions.jsonl` contains an entry with `id: "abc"` and `harness: "claude-code"`
- Given a session `"abc"` already exists, When a second `SessionStart` with `session_id: "abc"` arrives, Then `readSessions` returns exactly one entry for `"abc"` with the latest `lastEventTime`
- Given an event with no `session_id`, When piped to `weaver-log.sh`, Then the event is logged to `orphan.jsonl`

**Validation dispatch:**
- Given a `Stop` event, When the shell script dispatches validation, Then `validate.mjs` is called with `--trigger Stop --harness claude-code`
- Given `parse-args` receives `--trigger Stop`, When it parses, Then `trigger` is `"stop"`
- Given a `PostToolUse` event with `tool_name: "Write"`, When the shell script dispatches, Then `validate.mjs` receives `--tool-name Write`

**Auto-config:**
- Given a project with `.weaver.json` containing validation commands, When `sync-entry.mjs` runs, Then `.claude/settings.json` contains Weaver hook entries with calculated timeouts in seconds
- Given `.claude/settings.json` already has non-Weaver hooks, When patching, Then existing hooks are preserved
- Given a Weaver hook entry with an outdated timeout, When patching, Then the timeout is updated

**Agent config:**
- Given `.claude/agents/dev.md` exists with `skills: [coding-practices]` frontmatter, When `loadAgentConfig("dev", cwd)` is called, Then it returns `{ skills: ["coding-practices"], ... }`
- Given no agent file exists, When `loadAgentConfig("missing", cwd)` is called, Then it returns `null`

### Level 3: TDD (Unit Tests)

Red-Green-Refactor cycles for:

1. **Session dedup** (`sessions.ts`): `readSessions` deduplicates by ID
2. **Trigger normalization** (`parse-args.ts`): PascalCase -> camelCase mapping
3. **Skills key resolution** (`resolve-configured.ts`): direct name array handling
4. **Agent config loading** (`agent-config.ts`): frontmatter parsing, search path priority, error handling
5. **Settings patching** (`patch-settings.ts`): merge logic, timeout conversion (ms -> seconds), Weaver entry identification
6. **Sync orchestrator** (`sync.ts`): reads config, calculates timeouts, calls patch for both scopes

### Integration Tests

- Shell script tests (`weaver-log.test.sh`): 3 test suites (session, truncation, validation) using mock `log-event.mjs`
- E2E test (`claude-code-hook.spec.ts`): full flow from stdin through shell script to dashboard API

### Manual Testing Steps

1. Run `claude --agent dev` in a project with `.weaver.json`
2. Verify session appears in Weaver dashboard with correct agent name and `claude-code` harness badge
3. Submit a prompt and verify events stream into the session detail view
4. Run `/compact` in Claude Code and verify `PreCompact`/`PostCompact` events are logged
5. Resume the session with `claude --continue` and verify no duplicate session appears
6. Check `.claude/settings.json` contains Weaver hook entries with correct timeouts

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Concurrent writes to `sessions.jsonl`** from shell script (append) and server (`writeSessions` atomic rewrite) | Lost session entry if append happens between server read and atomic rename | Option B minimizes this: shell only appends, server rewrites atomically. A lost append is recovered on the next `SessionStart` (dedup handles it). Acceptable for non-critical metadata. |
| **Claude Code hook event schema changes** | Adapter fails to parse new/renamed fields | The adapter already has a `raw` pass-through field. Unknown events throw (fail-fast). Monitor Claude Code release notes. |
| **`gray-matter` parsing edge cases** | Agent config loading fails on unusual frontmatter | Return `null` on any parse error (same as kiro's malformed JSON handling). Log the error for debugging. |
| **PID resolution differs across macOS versions** | Agent name extraction fails | Fallback to `null` agent name (same as kiro's behavior when `--agent` is not found). Session still works, just without agent name. |
| **Auto-config overwrites user's custom hooks** | User loses their manually configured hooks | Patching logic identifies Weaver entries by command path (contains `weaver-log.sh`). All non-Weaver entries are preserved. Add a dry-run flag for safety. |
| **Timeout calculation produces 0 or negative values** | Hook times out immediately | Apply a minimum timeout floor (e.g., 10 seconds). Same pattern as kiro's `TIMEOUT_BUFFER_MS`. |

### Rollback Strategy

- All changes are additive: new files in `bindings/claude-code/`, new entries in existing arrays/maps
- The only modifications to shared code are backward-compatible: dedup in `readSessions` (no behavior change for unique IDs), trigger normalization (existing values pass through unchanged), `skills` key in resolver (existing `resources` path unchanged)
- To roll back: revert the branch. No data migration needed. Existing sessions and logs are unaffected.

### Monitoring and Observability

- The shell script logs errors to stderr (visible in Claude Code's hook output)
- `log-event.mjs` logs parse errors to `~/.weaver/logs/weaver.log`
- Session creation/update events are logged by the server's structured logger
- Sync operations log patched/skipped/error counts (same pattern as kiro)

## Dependencies

### External Systems

| Dependency | Usage | Risk |
|------------|-------|------|
| Claude Code hooks API | Event delivery via stdin JSON | Stable (documented at docs.anthropic.com). PascalCase event names and `session_id` field confirmed. |
| Claude Code settings.json schema | Auto-config target | Stable (documented). Schema is additive: Weaver adds entries, doesn't modify existing ones. |
| `gray-matter` npm package | YAML frontmatter parsing for agent configs | Already in `server/package.json`. Add to `bindings/claude-code/package.json`. |
| `jq` | Tool response truncation in shell script | Already required by kiro binding. Same dependency. |

### Team Dependencies

- No approvals needed: all changes are within the Weaver codebase
- No infrastructure changes: uses existing `~/.weaver/` data directory and server port

### Configuration Changes

- `bindings/claude-code/package.json`: add `gray-matter` dependency, update test script
- `bindings/claude-code/tsdown.config.ts`: add `sync-entry.ts` entry point
- `desktop/src/install-hooks.ts`: add claude-code hook entry
