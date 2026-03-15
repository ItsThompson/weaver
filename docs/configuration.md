# Configuration

Weaver uses two configuration files: a global user config and per-project validation configs.

## Global config: `~/.weaver/config.json`

Controls dashboard behavior, appearance, and integrations. Changes can be made through the Settings page in the dashboard, the CLI, or by editing the file directly.

Changes made via the Settings page or CLI take effect immediately. If you edit the file directly while the app is running, changes are picked up the next time the dashboard refreshes (e.g. switching tabs or pages). You do not need to restart the app.

| Option                       | Type                     | Default     | Description                                                  |
| ---------------------------- | ------------------------ | ----------- | ------------------------------------------------------------ |
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

### Display options

Available column values for `open_display_options`: `pid`, `customName`, `activity`, `cwd`, `agentName`, `startTime`, `lastEventTime`, `actions`

Available column values for `close_display_options`: `customName`, `cwd`, `agentName`, `startTime`, `lastEventTime`, `actions`

### Default test runners

The built-in test runner list used for agent test deduplication:

`jest`, `vitest`, `mocha`, `pytest`, `rspec`, `cargo test`, `npm test`, `npx test`, `bundle exec rspec`, `bundle exec rake test`, `go test`, `dotnet test`, `phpunit`

Add project-specific runners via `test_runners` in the global config or in your project's `.weaver.json`. Entries are merged with the defaults: you only need to add what's missing.

### Example

```json
{
  "enable_notification_sounds": true,
  "dark_mode": true,
  "ghost_mode": false,
  "ghost_opacity": 0.5,
  "webhook_url": "",
  "test_runners": ["bun test"]
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
