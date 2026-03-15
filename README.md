# Weaver

A local developer tool that provides observability, conversation editing, and automated validation on top of kiro-cli. Runs as a standalone Electron desktop app with a global hotkey, or in the browser for development.

## Features

- **Observability**: View conversation logs, tool usage, and session history through a dashboard
- **Cherrypick**: Select and remove parts of a conversation, then reload a pruned context via `/chat load`
- **Validation hooks**: Automatically run linting, type-checking, and tests after each agent turn, with failure context injected into the next prompt
- **Webhooks**: POST event payloads to Slack, Discord, or any URL when session events occur
- **Desktop app**: Electron wrapper with global hotkey (F5), tray icon, ghost mode, and mini mode
- **CLI**: Control the dashboard and configure settings from inside kiro-cli sessions
- **Orphan management**: Recover events from sessions that failed to initialize properly

## Quick start

See the [setup guide](docs/setup.md) for full instructions.

```bash
npm install
npm run app
```

## Running

```bash
# Desktop app (build + launch Electron)
npm run app

# Browser dev mode (hot reload)
npm run dev

# Package into a distributable .app / .dmg
npm run dist
```

## Documentation

| Document                                        | Description                                      |
| ----------------------------------------------- | ------------------------------------------------ |
| [Setup guide](docs/setup.md)                    | Prerequisites, installation, hook configuration  |
| [Configuration](docs/configuration.md)          | All config files and options                     |
| [CLI reference](docs/cli.md)                    | Full command reference                           |
| [Validation hooks](docs/features/validation.md) | Automated linting, testing, and prompt injection |
| [Webhooks](docs/features/webhooks.md)           | Event notifications to external services         |
| [Cherrypick](docs/features/cherrypick.md)       | Conversation pruning                             |
| [Ghost mode](docs/features/ghost-mode.md)       | Transparent overlay mode                         |
| [Mini mode](docs/features/mini-mode.md)         | Compact session list panel                       |
| [Notifications](docs/features/notifications.md) | Sound and visual notifications                   |

## Testing

```bash
# Unit tests
npm test

# E2E tests (requires macOS)
npm run test:e2e
```

## Data directory

All session data is stored in `~/.weaver/`:

| Path                      | Description                                                     |
| ------------------------- | --------------------------------------------------------------- |
| `sessions.jsonl`          | Session index                                                   |
| `logs/<session-id>.jsonl` | Per-session event logs                                          |
| `logs/orphan.jsonl`       | Events from unmatched PIDs                                      |
| `config.json`             | User configuration (see [configuration](docs/configuration.md)) |
