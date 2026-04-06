# Configuration

Weaver uses two configuration files: a global user config and per-project validation configs.

## Global config: `~/.weaver/config.json`

Controls dashboard behavior, appearance, and integrations. Changes can be made through the Settings page in the dashboard, the CLI, or by editing the file directly.

Changes made via the Settings page or CLI take effect immediately. If you edit the file directly while the app is running, changes are picked up the next time the dashboard refreshes (e.g. switching tabs or pages). You do not need to restart the app.

| Option                       | Type                     | Default     | Description                                                  |
| ---------------------------- | ------------------------ | ----------- | ------------------------------------------------------------ |
| `enable_dictation`           | `boolean`                | `false`     | Enable the dictation subsystem (desktop app only)            |
| `enable_notification_sounds` | `boolean`                | `true`      | Play sounds on session events                                |
| `dark_mode`                  | `boolean`                | `true`      | Dark theme for the dashboard                                 |
| `ghost_mode`                 | `boolean`                | `false`     | Transparent click-through overlay mode                       |
| `ghost_opacity`              | `number`                 | `0.5`       | Opacity when ghost mode is active (0 to 1)                   |
| `page_size`                  | `number`                 | `25`        | Number of sessions per page                                  |
| `open_display_options`       | `string[]`               | all columns | Columns shown for open sessions                              |
| `close_display_options`      | `string[]`               | all columns | Columns shown for closed sessions                            |
| `webhook_url`                | `string`                 | `""`        | URL to POST event payloads to                                |
| `webhook_format`             | `"simple" \| "advanced"` | `"simple"`  | Webhook payload format                                       |
| `test_runners`               | `string[]`               | see below   | Additional test runner patterns for agent test deduplication |
| `skill_paths`                | `string[]`               | `[]`        | Directories containing skill subdirectories (see below)      |
| `skill_graph`                | `object`                 | `{}`        | Skill graph category definitions (see below)                 |
| `dictation`                  | `object`                 | see below   | Dictation settings (desktop app only, see below)             |

### Display options

Available column values for `open_display_options`: `pid`, `customName`, `activity`, `cwd`, `agentName`, `startTime`, `lastEventTime`, `actions`

Available column values for `close_display_options`: `customName`, `cwd`, `agentName`, `startTime`, `lastEventTime`, `actions`

### Default test runners

The built-in test runner list used for agent test deduplication:

`jest`, `vitest`, `mocha`, `pytest`, `rspec`, `cargo test`, `npm test`, `npx test`, `bundle exec rspec`, `bundle exec rake test`, `go test`, `dotnet test`, `phpunit`

Add project-specific runners via `test_runners` in the global config or in your project's `.weaver.json`. Entries are merged with the defaults: you only need to add what's missing.

### Skill paths

Configure additional directories where Weaver looks for skills. Each path should point to a directory containing skill subdirectories (each with a `SKILL.md` file). `~/.kiro/skills` is always included as the global skills path and cannot be added to `skill_paths`.

If a path ends with `.kiro/skills`, the project name is derived from the parent directory (e.g., `~/projects/my-app/.kiro/skills` yields project `my-app`). Otherwise, the basename of the path is used as the project name.

Paths can be managed from the Settings page or by editing the config file directly. All paths are validated on save: they must exist, be directories, and not be duplicates.

```json
{
  "skill_paths": ["~/projects/my-app/.kiro/skills", "~/projects/shared-skills"]
}
```

### Skill graph categories

Define custom categories for the skill graph. Each category has an optional hex color and a list of skill names. A skill can belong to at most one category: the validator rejects configs with duplicate assignments.

If a category has no `color`, it gets one from a default palette. Skills not assigned to any category appear as uncategorized (grey).

```json
{
  "skill_graph": {
    "categories": {
      "core": { "color": "#ff6b6b", "skills": ["coding-practices"] },
      "language": { "skills": ["typescript-standards", "python-standards"] },
      "domain": { "color": "#45b7d1", "skills": ["backend-coding-practices"] }
    }
  }
}
```

| Field                                  | Type       | Required | Description                            |
| -------------------------------------- | ---------- | -------- | -------------------------------------- |
| `skill_graph.categories`               | `object`   | No       | Map of category name to definition     |
| `skill_graph.categories.<name>.color`  | `string`   | No       | Hex color (e.g. `#ff6b6b`)             |
| `skill_graph.categories.<name>.skills` | `string[]` | Yes      | Skill directory names in this category |

Categories can also be managed from the Settings page (bulk editing) or the Skill Detail page (per-skill assignment).

### Dictation

Configure the local dictation pipeline. These settings only apply in the desktop app. They can be managed from the Settings page under the "Dictation" heading.

Set `enable_dictation` to `true` to start the dictation subsystem. When enabled, whisper starts eagerly on app launch. When disabled, no dictation services run.

Changing `enable_dictation`, `dictation.llm_cleanup`, `dictation.ollama_url`, or `dictation.ollama_model` triggers a service restart with a confirmation prompt.

| Option                   | Type      | Default                    | Description                                                        |
| ------------------------ | --------- | -------------------------- | ------------------------------------------------------------------ |
| `dictation.ollama_url`   | `string`  | `"http://localhost:11434"` | URL of the Ollama server                                           |
| `dictation.ollama_model` | `string`  | `"phi4-mini"`              | Ollama model for transcript cleanup                                |
| `dictation.llm_cleanup`  | `boolean` | `true`                     | Run LLM post-processing on transcripts. Disable for lower latency. |

Recommended models: `phi4-mini` (best quality), `qwen3:1.7b` (fast, multilingual), `gemma3:1b` (smallest download).

The Settings page shows an inline status indicator next to the Ollama URL field displaying the current ollama service state.

```json
{
  "enable_dictation": true,
  "dictation": {
    "ollama_url": "http://localhost:11434",
    "ollama_model": "phi4-mini",
    "llm_cleanup": true
  }
}
```

### Example

```json
{
  "enable_dictation": true,
  "enable_notification_sounds": true,
  "dark_mode": true,
  "ghost_mode": false,
  "ghost_opacity": 0.5,
  "webhook_url": "",
  "test_runners": ["bun test"],
  "dictation": {
    "ollama_model": "qwen3:1.7b",
    "llm_cleanup": false
  }
}
```

## Project config: `.weaver.json`

Per-project validation hooks. Place this file in your project root (or per-package in a monorepo). See [validation hooks](features/validation.md) for the full schema and examples.

### Example

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
        "name": "prettier",
        "command": "npx prettier --write {{file}}",
        "timeout_ms": 10000
      }
    ]
  }
}
```

## Environment variables

| Variable                     | Default                 | Description                                               |
| ---------------------------- | ----------------------- | --------------------------------------------------------- |
| `WEAVER_SERVER`              | `http://localhost:8143` | Server URL used by the CLI and hook scripts               |
| `WEAVER_MAX_RESPONSE_LENGTH` | `500`                   | Max character length for tool response truncation in logs |

## Application logs

Weaver writes structured JSONL logs to `~/.weaver/app-logs/YYYY-MM-DD.log`. Each line includes a `source` field identifying the package that produced it (`server`, `desktop`, `hook-handler`, `server:stdout`, or `server:stderr`).

Log files older than 30 days are automatically deleted on server startup. To share logs for debugging, send the relevant date's file from `~/.weaver/app-logs/`.
