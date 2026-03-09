# Weaver Validation Hooks

Validation hooks let you run formatting, linting, type-checking, and test commands automatically during kiro-cli sessions. Define them in a `.weaver` config file at your project root and Weaver handles the rest — running commands at the right time, surfacing failures as warnings, and injecting error context into the LLM's next prompt so it can self-correct.

## How it works

```
Agent writes code → stop hook fires → validation commands run
                                        ├── All pass → silent (exit 0)
                                        └── Any fail → STDERR warning shown to user
                                                       Pending file written

User submits next prompt → userPromptSubmit hook fires
                            └── Pending file found → failure details injected into LLM context
                                                     Pending file deleted
```

1. **On `stop`**: After the agent finishes a turn, each `stop` validation hook runs. Changed files from the turn are extracted from the session log and used to populate template variables. If any command fails, a warning is printed to STDERR (shown to the user) and a `.pending` file is written.
2. **On `postToolUse`**: After each `fs_write` tool call, matching `postToolUse` hooks run (e.g. auto-formatting the written file).
3. **On `userPromptSubmit`**: If a `.pending` file exists from a previous turn's failures, its contents are formatted and printed to STDOUT, which kiro-cli injects into the LLM's context. The pending file is then deleted.

This creates a feedback loop: the agent sees its own validation failures and can fix them without the user having to copy-paste error output.

## Config file

Create a `.weaver` file (JSON) in your project root:

```json
{
  "validation": {
    "stop": [
      {
        "name": "typecheck",
        "command": "npx tsc --noEmit",
        "timeout_ms": 30000
      }
    ],
    "postToolUse": [
      {
        "matcher": "fs_write",
        "name": "format",
        "command": "npx prettier --write {{file}}",
        "timeout_ms": 10000
      }
    ]
  }
}
```

The config is read from the current working directory of the kiro-cli session. There is no global config — each project has its own `.weaver` file.

Invalid hooks (missing required fields) are silently filtered out with a STDERR warning. Invalid JSON or a missing file means no validation runs.

## Schema reference

### `stop` hooks

Run after the agent completes a turn.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | — | Human-readable identifier shown in output |
| `command` | `string` | Yes | — | Shell command to execute. Supports [template variables](#template-variables). |
| `scope` | `"file"` \| `"parent"` \| `"cwd"` \| `number` | No | `"cwd"` | How to derive test directories from changed files. See [Scope](#scope). |
| `run_if_files_match` | `string` | No | — | Extension glob — command only runs if at least one changed file matches. Omit to always run. |
| `working_dir` | `string` | No | CWD | Directory to run from, relative to CWD. |
| `timeout_ms` | `number` | No | `30000` | Per-command timeout in milliseconds. |

### `postToolUse` hooks

Run after a specific tool call (matched by `matcher`).

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `matcher` | `string` | Yes | — | Tool name to match (e.g. `fs_write`) |
| `name` | `string` | Yes | — | Human-readable identifier |
| `command` | `string` | Yes | — | Shell command. Supports `{{file}}`. |
| `timeout_ms` | `number` | No | `10000` | Per-command timeout in milliseconds. |

## Template variables

| Variable | Available in | Description |
|----------|-------------|-------------|
| `{{file}}` | `postToolUse` | Single file path from the tool's `path` input |
| `{{files}}` | `stop` | Space-separated list of all files written during the turn |
| `{{files_csv}}` | `stop` | Comma-separated list of all files written during the turn |
| `{{test_dirs}}` | `stop` | Deduplicated, scope-derived test directories (after agent-test dedup) |

If a command uses `{{files}}` or `{{test_dirs}}` but the resolved value is empty, the command is **skipped** (not failed). The result will show `skipped_reason` in the output.

## Scope

The `scope` field on `stop` hooks controls how test directories are derived from changed files. Given a changed file at `src/features/auth/login/LoginForm.tsx`:

| `scope` value | Depth | Derived directory |
|---------------|-------|-------------------|
| `"file"` or `0` | 0 | `src/features/auth/login` |
| `"parent"` or `1` | 1 | `src/features/auth` |
| `2` | 2 | `src/features` |
| `3` | 3 | `src` |
| `"cwd"` or omitted | ∞ | `.` (project root) |

**Deduplication**: Overlapping directories are collapsed — a parent directory subsumes its children. If changed files produce both `src/features/auth` and `src/features/auth/login`, only `src/features/auth` is kept.

**Safety**: Resolved directories are clamped to CWD. Symlinks are resolved via `fs.realpathSync`; if the resolved path is outside CWD, it clamps to `"."`.

## Agent test deduplication

The validation runner scans the current turn's `execute_bash` events for known test runner invocations. If the agent already ran tests covering a directory, the validation runner skips redundant test runs for that directory.

### Detected test runners

`jest`, `vitest`, `mocha`, `pytest`, `cargo test`, `npm test`, `npx test`

### Deduplication logic

| Agent tested | Validation derives | Result |
|---|---|---|
| `foo/bar/` | `foo/bar/baz/` | **Skip** — parent covers child |
| `foo/bar/` | `foo/bar/` | **Skip** — exact match |
| `foo/bar/baz/` | `foo/bar/` | **Run** — agent only tested a subset |
| (nothing) | `foo/bar/` | **Run** |

Directory arguments are extracted from the command by finding the last non-flag token containing `/` after the test runner match. If no directory argument is found, the tested directory defaults to `.` (CWD).

This is a heuristic — it won't catch every test invocation pattern. When in doubt, the runner errs on the side of running the validation (safe default).

## Example configs

### Simple project — typecheck + lint

```json
{
  "validation": {
    "stop": [
      {
        "name": "typecheck",
        "command": "npx tsc --noEmit",
        "timeout_ms": 30000
      },
      {
        "name": "lint",
        "command": "npx eslint {{files}}",
        "run_if_files_match": "**/*.{ts,tsx}",
        "timeout_ms": 15000
      }
    ]
  }
}
```

### Monorepo with scoped tests

```json
{
  "validation": {
    "stop": [
      {
        "name": "typecheck",
        "command": "npx tsc --noEmit"
      },
      {
        "name": "test:scoped",
        "command": "npx jest {{test_dirs}}",
        "scope": "parent",
        "run_if_files_match": "**/*.{ts,tsx}",
        "timeout_ms": 60000
      }
    ]
  }
}
```

With `scope: "parent"`, a change to `packages/auth/src/login.ts` derives test directory `packages/auth/src` → goes up one level → `packages/auth`. The runner executes `npx jest packages/auth`. If the agent already ran `npx jest packages/auth` during the turn, the validation skips it.

### Formatter on write

```json
{
  "validation": {
    "postToolUse": [
      {
        "matcher": "fs_write",
        "name": "prettier",
        "command": "npx prettier --write {{file}}",
        "timeout_ms": 10000
      }
    ]
  }
}
```

Runs `prettier --write` on every file the agent writes, immediately after each `fs_write` tool call.

### Combined config

```json
{
  "validation": {
    "stop": [
      {
        "name": "typecheck",
        "command": "npx tsc --noEmit",
        "timeout_ms": 30000
      },
      {
        "name": "test:scoped",
        "command": "npx jest {{test_dirs}}",
        "scope": "parent",
        "run_if_files_match": "**/*.{ts,tsx}",
        "timeout_ms": 60000
      },
      {
        "name": "lint:changed",
        "command": "npx eslint {{files}}",
        "run_if_files_match": "**/*.{ts,tsx}",
        "timeout_ms": 15000
      }
    ],
    "postToolUse": [
      {
        "matcher": "fs_write",
        "name": "format",
        "command": "npx prettier --write {{file}}",
        "timeout_ms": 10000
      }
    ]
  }
}
```

## Timeouts

Each command has a `timeout_ms` field that controls how long it can run before being killed.

| Hook type | Default timeout | Field |
|-----------|----------------|-------|
| `stop` | 30,000 ms (30s) | `timeout_ms` |
| `postToolUse` | 10,000 ms (10s) | `timeout_ms` |

When a command times out, it is killed and marked as failed with `timed_out: true` in the result. The output captured up to that point is still included.

**kiro-cli hook timeout**: kiro-cli itself has a `timeout_ms` setting for how long it waits for hook scripts to complete. Make sure the kiro-cli hook timeout is greater than the sum of your validation command timeouts, or individual commands may be killed by the outer timeout before they finish. Refer to kiro-cli documentation for configuring hook timeouts.

**Output truncation**: Command output (stdout + stderr combined) is truncated to 5,000 characters to prevent excessive log sizes.

## Fix-validation prompt

A reusable prompt file is provided at `hook-handler/prompts/fix-validation.md` for instructing the LLM to fix validation failures. It tells the agent to:

1. Read the error output from the injected validation results
2. Identify root causes
3. Fix the code
4. Not re-run tests (Weaver validates automatically on the next stop)

### Installation

To make this prompt available in kiro-cli, symlink or copy it to your kiro-cli prompts directory:

```bash
ln -s ~/Documents/weaver/hook-handler/prompts/fix-validation.md \
  ~/.config/amazonq/global/prompts/fix-validation.md
```

Then invoke it in a kiro-cli session with `/prompt fix-validation` after seeing validation failures.

## Feedback loop in detail

### Turn N: agent writes code

1. Agent makes changes via `fs_write` tool calls
2. Each `fs_write` triggers matching `postToolUse` hooks (e.g. auto-format)
3. Agent finishes → `stop` event fires
4. Validation runner:
   - Reads `.weaver` config
   - Extracts changed files from the session log (current turn's `fs_write` events)
   - Extracts agent-tested directories from `execute_bash` events
   - Resolves test directories based on `scope`, deduplicates against agent-tested dirs
   - Runs each `stop` hook command
   - Appends a `validation` event to the session log (for dashboard visibility)
   - If any fail: writes `~/.weaver/logs/<session-id>.pending` and exits non-zero with STDERR summary

5. User sees: `⚠ weaver: 2/3 validations failed (typecheck, test)`

### Turn N+1: user submits prompt

1. `userPromptSubmit` hook fires
2. Injection script checks for `<session-id>.pending` file
3. If found: reads failure details, formats them, outputs to STDOUT, deletes the file
4. kiro-cli injects the STDOUT into the LLM's context
5. The LLM sees the validation failures and can self-correct

### Injected context format

```
[Weaver Validation — Previous Turn]

✗ typecheck (2.3s)
  src/index.ts(15,3): error TS2322: Type 'string' is not assignable to type 'number'.

✓ lint (1.1s)

⊘ test:scoped — skipped (no test dirs after deduplication)
```

- `✗` — failed (includes indented output)
- `✓` — passed
- `⊘` — skipped (with reason)

## Edge cases and limitations

- **Extension-only glob matching (v1)**: `run_if_files_match` only supports extension-based patterns like `**/*.{ts,tsx}` or `**/*.py`. Full glob patterns with directory matching or negation are not supported. Unrecognized patterns match all files (safe default).
- **No pre-tool blocking**: v1 only supports `stop` and `postToolUse` validation. There is no `preToolUse` validation that could block a tool call before it executes.
- **Single config location**: Only `.weaver` in the project root (CWD) is read. There is no global config or config inheritance.
- **No IPC to kiro-cli**: Validation cannot programmatically send messages to an active session. Communication is limited to exit codes, STDERR, and STDOUT as defined by kiro-cli's hook contract.
- **Agent test deduplication is heuristic**: Only known test runner patterns are detected. Custom test scripts or unusual invocations won't be recognized. The safe default is to run the validation.
- **Symlinks outside CWD**: If a changed file's real path (after symlink resolution) is outside CWD, the derived test directory clamps to `"."` (project root).
- **Validation runner crashes**: If the Node.js validation runner itself crashes (as opposed to a validation command failing), `weaver-log.sh` swallows the error and exits 0. This ensures logging always succeeds even if validation is broken. The crash is distinguished from a real validation failure by checking for the `⚠ weaver:` marker in STDERR.
- **Pending file is per-session**: Only one pending file exists at a time per session (`<session-id>.pending`). If the agent fails validation on consecutive turns without a `userPromptSubmit` in between, the pending file is overwritten with the latest results.
- **No retries**: Failed commands are not retried. Each command runs once per trigger.
- **Shared package runtime imports**: The hook-handler cannot import runtime values from `@weaver/shared` at ESM runtime because the shared package's barrel exports use extensionless re-exports. Runtime constants (like timeout defaults) are inlined in the hook-handler source. Type-only imports work fine since they're erased at compile time.
