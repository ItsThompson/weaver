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

1. **On `stop`**: After the agent finishes a turn, changed files are grouped by their nearest `.weaver` config. Each group's `stop` hooks run independently against its own files. If any command fails, a warning is printed to STDERR (shown to the user) and a `.pending` file is written.
2. **On `postToolUse`**: After each `fs_write` tool call, the nearest `.weaver` config is discovered by walking up from the written file. Matching `postToolUse` hooks run (e.g. auto-formatting the written file). Files with no `.weaver` ancestor are silently skipped.
3. **On `userPromptSubmit`**: If a `.pending` file exists from a previous turn's failures, its contents are formatted and printed to STDOUT, which kiro-cli injects into the LLM's context. The pending file is then deleted.

This creates a feedback loop: the agent sees its own validation failures and can fix them without the user having to copy-paste error output.

## Config file

Create a `.weaver` file (JSON) in your project root:

```json
{
  "validation": {
    "test_runners": ["mix test"],
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

Config is discovered by walking up the directory tree from the file being operated on until a `.weaver` file is found. For `postToolUse` hooks, the walk starts from the written file's parent directory (or the session CWD for non-file tool events). For `stop` hooks, each changed file is grouped by its nearest `.weaver` ancestor, and each group's hooks run independently. Files with no `.weaver` ancestor are silently skipped.

This means you can place a `.weaver` file at any level: a single project root, or per-package in a monorepo. The directory containing the `.weaver` file becomes the working directory for hook execution (the "config root").

Invalid hooks (missing required fields) are silently filtered out with a STDERR warning. Invalid JSON or a missing file means no validation runs.

### `test_runners`

Optional array of test runner patterns used for [agent test deduplication](#agent-test-deduplication). Per-project entries are merged with global defaults from `~/.weaver/config.json` and the built-in default list. See [Customizing test runners](#customizing-test-runners) for details.

## Schema reference

### `stop` hooks

Run after the agent completes a turn.

| Field                | Type                                          | Required | Default     | Description                                                                                  |
| -------------------- | --------------------------------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------- |
| `name`               | `string`                                      | Yes      | —           | Human-readable identifier shown in output                                                    |
| `command`            | `string`                                      | Yes      | —           | Shell command to execute. Supports [template variables](#template-variables).                |
| `scope`              | `"file"` \| `"parent"` \| `"cwd"` \| `number` | No       | `"cwd"`     | How to derive test directories from changed files. See [Scope](#scope).                      |
| `run_if_files_match` | `string`                                      | No       | —           | Extension glob — command only runs if at least one changed file matches. Omit to always run. |
| `working_dir`        | `string`                                      | No       | Config root | Directory to run from, relative to the config root (the directory containing `.weaver`).     |
| `timeout_ms`         | `number`                                      | No       | `30000`     | Per-command timeout in milliseconds.                                                         |

### `postToolUse` hooks

Run after a specific tool call (matched by `matcher`).

| Field        | Type     | Required | Default | Description                          |
| ------------ | -------- | -------- | ------- | ------------------------------------ |
| `matcher`    | `string` | Yes      | —       | Tool name to match (e.g. `fs_write`) |
| `name`       | `string` | Yes      | —       | Human-readable identifier            |
| `command`    | `string` | Yes      | —       | Shell command. Supports `{{file}}`.  |
| `timeout_ms` | `number` | No       | `10000` | Per-command timeout in milliseconds. |

## Template variables

| Variable        | Available in  | Description                                                           |
| --------------- | ------------- | --------------------------------------------------------------------- |
| `{{file}}`      | `postToolUse` | Single file path from the tool's `path` input                         |
| `{{files}}`     | `stop`        | Space-separated list of all files written during the turn             |
| `{{files_csv}}` | `stop`        | Comma-separated list of all files written during the turn             |
| `{{test_dirs}}` | `stop`        | Deduplicated, scope-derived test directories (after agent-test dedup) |

If a command uses `{{files}}` or `{{test_dirs}}` but the resolved value is empty, the command is **skipped** (not failed). The result will show `skipped_reason` in the output.

## Scope

The `scope` field on `stop` hooks controls how test directories are derived from changed files. Given a changed file at `src/features/auth/login/LoginForm.tsx`:

| `scope` value      | Depth | Derived directory         |
| ------------------ | ----- | ------------------------- |
| `"file"` or `0`    | 0     | `src/features/auth/login` |
| `"parent"` or `1`  | 1     | `src/features/auth`       |
| `2`                | 2     | `src/features`            |
| `3`                | 3     | `src`                     |
| `"cwd"` or omitted | ∞     | `.` (project root)        |

**Deduplication**: Overlapping directories are collapsed — a parent directory subsumes its children. If changed files produce both `src/features/auth` and `src/features/auth/login`, only `src/features/auth` is kept.

**Safety**: Resolved directories are clamped to the config root. Symlinks are resolved via `fs.realpathSync`; if the resolved path is outside the config root, it clamps to `"."`.

## Agent test deduplication

The validation runner scans the current turn's `execute_bash` events for known test runner invocations. If the agent already ran tests covering a directory, the validation runner skips redundant test runs for that directory.

### Default test runners

`jest`, `vitest`, `mocha`, `pytest`, `rspec`, `cargo test`, `npm test`, `npx test`, `bundle exec rspec`, `bundle exec rake test`, `go test`, `dotnet test`, `phpunit`

### Customizing test runners

The runner list is resolved by merging three sources (deduplicated):

1. **Built-in defaults** — the list above
2. **Global config** — `test_runners` array in `~/.weaver/config.json`
3. **Project config** — `test_runners` array in `.weaver` `validation` block

Global entries extend the defaults. Project entries extend the result. This means you never need to repeat the defaults — just add what's missing.

```json
// ~/.weaver/config.json — applies to all projects
{
  "test_runners": ["bun test"]
}
```

```json
// .weaver — project-specific additions
{
  "validation": {
    "test_runners": ["mix test", "elixir -S mix test"],
    "stop": [...]
  }
}
```

### Deduplication logic

| Agent tested   | Validation derives | Result                               |
| -------------- | ------------------ | ------------------------------------ |
| `foo/bar/`     | `foo/bar/baz/`     | **Skip** — parent covers child       |
| `foo/bar/`     | `foo/bar/`         | **Skip** — exact match               |
| `foo/bar/baz/` | `foo/bar/`         | **Run** — agent only tested a subset |
| (nothing)      | `foo/bar/`         | **Run**                              |

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

### Monorepo with per-package configs

In a monorepo where each package has its own tooling, place a `.weaver` file in each package directory instead of (or in addition to) the root:

```
monorepo/
├── packages/
│   ├── api/
│   │   ├── .weaver          ← api-specific hooks
│   │   └── src/
│   └── web/
│       ├── .weaver          ← web-specific hooks
│       └── src/
```

Each package's hooks run independently against only the files within that package. Files outside any `.weaver` ancestor are silently skipped. The `working_dir` for each hook resolves relative to the package's `.weaver` location.

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

| Hook type     | Default timeout | Field        |
| ------------- | --------------- | ------------ |
| `stop`        | 30,000 ms (30s) | `timeout_ms` |
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
   - Discovers `.weaver` config by walking up from each changed file
   - Groups changed files by their nearest `.weaver` config root
   - For each config group:
     - Extracts agent-tested directories from `execute_bash` events
     - Resolves test directories based on `scope`, deduplicates against agent-tested dirs
     - Runs each `stop` hook command with the config root as working directory
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
- **Config discovery**: Validation hooks are discovered by walking up the directory tree from each file. A `.weaver` file can live at any level (project root, package root in a monorepo, etc.). Files with no `.weaver` ancestor are silently skipped. `~/.weaver/config.json` provides global `test_runners` but not hook definitions.
- **No IPC to kiro-cli**: Validation cannot programmatically send messages to an active session. Communication is limited to exit codes, STDERR, and STDOUT as defined by kiro-cli's hook contract.
- **Agent test deduplication is heuristic**: Detection relies on pattern-matching known test runner names in `execute_bash` commands. Custom runners can be added via `test_runners` in `~/.weaver/config.json` or the project `.weaver` file. Unusual invocations that don't match any pattern won't be recognized. The safe default is to run the validation.
- **Symlinks outside config root**: If a changed file's real path (after symlink resolution) is outside the config root, the derived test directory clamps to `"."` (config root).
- **Validation runner crashes**: If the Node.js validation runner itself crashes (as opposed to a validation command failing), `weaver-log.sh` swallows the error and exits 0. This ensures logging always succeeds even if validation is broken. The crash is distinguished from a real validation failure by checking for the `⚠ weaver:` marker in STDERR.
- **Pending file is per-session**: Only one pending file exists at a time per session (`<session-id>.pending`). If the agent fails validation on consecutive turns without a `userPromptSubmit` in between, the pending file is overwritten with the latest results.
- **No retries**: Failed commands are not retried. Each command runs once per trigger.
- **Shared package runtime imports**: The hook-handler uses tsdown with `deps.alwaysBundle: [/^@weaver\//]` to bundle `@weaver/shared` types and constants inline at build time. This avoids ESM resolution issues with the shared package's extensionless barrel re-exports.
