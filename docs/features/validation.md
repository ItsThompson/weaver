# Validation hooks

Validation hooks let you run formatting, linting, type-checking, and test commands automatically during kiro-cli sessions. Define them in a `.weaver.json` config file at your project root and Weaver handles the rest: running commands at the right time, surfacing failures as warnings, and injecting error context into the LLM's next prompt so it can self-correct.

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

1. **On `stop`**: After the agent finishes a turn, changed files are grouped by their nearest `.weaver.json` config. Each group's `stop` hooks run independently against its own files. If any command fails, a warning is printed to STDERR and a pending file is written.
2. **On `postToolUse`**: After each `fs_write` tool call, the nearest `.weaver.json` config is found by walking up from the written file. Matching `postToolUse` hooks run (e.g. auto-formatting). Files with no `.weaver.json` ancestor are silently skipped.
3. **On `userPromptSubmit`**: If a pending file exists from a previous turn's failures, its contents are formatted and printed to STDOUT, which kiro-cli injects into the LLM's context. The pending file is then deleted.

This creates a feedback loop: the agent sees its own validation failures and can fix them without the user having to copy-paste error output.

## Config file

Create a `.weaver.json` file in your project root:

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

Config is discovered by walking up the directory tree from the file being operated on until a `.weaver.json` file is found. This means you can place a config at any level: a single project root, or per-package in a monorepo. The directory containing the `.weaver.json` file becomes the working directory for hook execution.

Invalid hooks (missing required fields) are silently filtered out with a STDERR warning. Invalid JSON or a missing file means no validation runs.

## Schema reference

### `stop` hooks

Run after the agent completes a turn.

| Field                | Type                                    | Required | Default     | Description                                                                                 |
| -------------------- | --------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------- |
| `name`               | `string`                                | Yes      | —           | Human-readable identifier shown in output                                                   |
| `command`            | `string`                                | Yes      | —           | Shell command to execute. Supports [template variables](#template-variables).               |
| `type`               | `"test" \| "check"`                     | No       | —           | Hook classification                                                                         |
| `scope`              | `"file" \| "parent" \| "cwd" \| number` | No       | `"cwd"`     | How to derive test directories from changed files. See [Scope](#scope).                     |
| `run_if_files_match` | `string`                                | No       | —           | Extension glob: command only runs if at least one changed file matches. Omit to always run. |
| `working_dir`        | `string`                                | No       | Config root | Directory to run from, relative to the config root.                                         |
| `timeout_ms`         | `number`                                | No       | `30000`     | Per-command timeout in milliseconds.                                                        |

### `postToolUse` hooks

Run after a specific tool call.

| Field        | Type     | Required | Default | Description                          |
| ------------ | -------- | -------- | ------- | ------------------------------------ |
| `matcher`    | `string` | Yes      | —       | Tool name to match (e.g. `fs_write`) |
| `name`       | `string` | Yes      | —       | Human-readable identifier            |
| `command`    | `string` | Yes      | —       | Shell command. Supports `{{file}}`.  |
| `timeout_ms` | `number` | No       | `10000` | Per-command timeout in milliseconds. |

## Template variables

| Variable        | Available in  | Description                                               |
| --------------- | ------------- | --------------------------------------------------------- |
| `{{file}}`      | `postToolUse` | Single file path from the tool call                       |
| `{{files}}`     | `stop`        | Space-separated list of all files written during the turn |
| `{{files_csv}}` | `stop`        | Comma-separated list of all files written during the turn |
| `{{test_dirs}}` | `stop`        | Deduplicated, scope-derived test directories              |

If a command uses `{{files}}` or `{{test_dirs}}` but the resolved value is empty, the command is skipped (not failed).

## Scope

The `scope` field on `stop` hooks controls how test directories are derived from changed files. Given a changed file at `src/features/auth/login/LoginForm.tsx`:

| `scope` value      | Derived directory         |
| ------------------ | ------------------------- |
| `"file"` or `0`    | `src/features/auth/login` |
| `"parent"` or `1`  | `src/features/auth`       |
| `2`                | `src/features`            |
| `3`                | `src`                     |
| `"cwd"` or omitted | `.` (project root)        |

Overlapping directories are collapsed: a parent directory subsumes its children.

## Agent test deduplication

Weaver scans the current turn's `execute_bash` events for known test runner invocations. If the agent already ran tests covering a directory, Weaver skips redundant test runs for that directory.

### Customizing test runners

The runner list is resolved by merging three sources (deduplicated):

1. **Built-in defaults**: `jest`, `vitest`, `mocha`, `pytest`, `rspec`, `cargo test`, `npm test`, `npx test`, `bundle exec rspec`, `bundle exec rake test`, `go test`, `dotnet test`, `phpunit`
2. **Global config**: `test_runners` array in `~/.weaver/config.json`
3. **Project config**: `test_runners` array in `.weaver.json`

You never need to repeat the defaults: just add what's missing.

```json
{
  "validation": {
    "test_runners": ["mix test", "bun test"],
    "stop": [...]
  }
}
```

### Deduplication logic

| Agent tested   | Validation derives | Result                              |
| -------------- | ------------------ | ----------------------------------- |
| `foo/bar/`     | `foo/bar/baz/`     | **Skip**: parent covers child       |
| `foo/bar/`     | `foo/bar/`         | **Skip**: exact match               |
| `foo/bar/baz/` | `foo/bar/`         | **Run**: agent only tested a subset |
| (nothing)      | `foo/bar/`         | **Run**                             |

## Examples

### Simple project: typecheck + lint

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

### Monorepo with per-package configs

Place a `.weaver.json` in each package directory:

```
monorepo/
├── .weaver.json                   ← fallback for files not in a package
├── packages/
│   ├── api/
│   │   ├── .weaver.json          ← api-specific hooks
│   │   └── src/
│   └── web/
│       ├── .weaver.json          ← web-specific hooks
│       └── src/
```

Nearest config wins. There is no merging between levels. The root `.weaver.json` acts as a fallback for files that aren't inside a package with its own config.

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

| Hook type     | Default timeout |
| ------------- | --------------- |
| `stop`        | 30,000 ms (30s) |
| `postToolUse` | 10,000 ms (10s) |

When a command times out, it is killed and marked as failed. Output captured up to that point is still included.

Make sure the kiro-cli hook timeout is greater than the sum of your validation command timeouts, or individual commands may be killed before they finish.

Command output (stdout + stderr combined) is truncated to 5,000 characters to prevent excessive log sizes.

## Injected context format

When validation failures are injected into the LLM's next prompt, they look like this:

```
[Weaver Validation — Previous Turn]

✗ typecheck (2.3s)
  src/index.ts(15,3): error TS2322: Type 'string' is not assignable to type 'number'.

✓ lint (1.1s)

⊘ test:scoped — skipped (no test dirs after deduplication)
```

- `✗` : failed (includes indented output)
- `✓` : passed
- `⊘` : skipped (with reason)

## Limitations

- `run_if_files_match` only supports extension-based patterns like `**/*.{ts,tsx}`. Full glob patterns with directory matching are not supported.
- No `preToolUse` validation: hooks only run on `stop` and `postToolUse`.
- Only one pending file exists per session. Consecutive failures without a prompt in between overwrite the previous results.
- Failed commands are not retried.
- Agent test deduplication is heuristic: unusual test invocations may not be recognized. When in doubt, Weaver runs the validation.
