# Weaver

A local developer tool that provides observability and conversation editing capabilities on top of kiro-cli. Runs as a standalone Electron app with a global hotkey, or in the browser for development.

## Features

- **Observability**: View conversation logs, tool usage, and session history through a web dashboard
- **Cherrypick**: Select and remove parts of a conversation, then reload a pruned context via `/chat load`
- **Desktop app**: Electron wrapper with global hotkey (F5), tray icon, and no Dock presence

## Prerequisites

- Node.js 20+
- kiro-cli installed and configured

## Setup

```bash
# Install root dependencies
npm install

# Install package dependencies
npm install --prefix server
npm install --prefix client
npm install --prefix electron

# Install hook handler (see hook-handler/README.md for details)
ln -s ~/Documents/weaver/hook-handler/weaver-log.sh ~/.config/amazonq/global/hooks/weaver-log.sh
chmod +x hook-handler/weaver-log.sh

# Install CLI dependencies
npm install --prefix cli

# Add weaver to your PATH (works in bash, zsh, and kiro-cli)
ln -s ~/Documents/weaver/bin/weaver ~/.local/bin/weaver

# Optional: add a shorthand alias (add to ~/.zshrc or ~/.bashrc)
alias wv='weaver view'
```

## Running

```bash
# Desktop app (build + launch Electron)
npm run app

# Browser dev mode (Vite hot reload + Fastify server)
npm run dev

# Package into a distributable .app / .dmg
npm run dist
```

The desktop app:
- Press **F5** from anywhere to toggle the window
- Click the tray icon (top-right menu bar) to show/hide
- Right-click the tray icon to quit
- No Dock icon — runs as a background panel

## CLI Commands

| Command | Description |
|---------|-------------|
| `weaver view` | Navigate dashboard to the current kiro-cli session |
| `weaver session` | Navigate dashboard to the sessions list |
| `weaver session list` | Navigate dashboard to the sessions list |
| `weaver session <PID>` | Navigate dashboard to a specific session by PID |

## Development

```bash
# Start both client and server with hot reload
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8143
- Health check: http://localhost:8143/api/health

## Testing

```bash
# Run server tests
npm test --prefix server
```

## Webhooks

Weaver can POST event payloads to a configured URL when session events occur. Useful for Slack/Discord notifications, especially for pending tool approvals.

### Setup

Set `webhook_url` in the Settings page or directly in `~/.weaver/config.json`:

```json
{
  "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx"
}
```

Leave empty to disable. Must start with `http://` or `https://`.

### Payload schema

```json
{
  "event": "preToolUse",
  "activity": "running_tool",
  "timestamp": "2026-03-05T12:58:00.000Z",
  "session": {
    "id": "abc-123",
    "name": "my-project",
    "pid": 12345,
    "cwd": "/Users/me/project"
  },
  "context": {
    "prompt": "add error handling to the upload function",
    "tool_name": "fs_write",
    "tool_input": { "command": "str_replace", "path": "/src/upload.ts" }
  },
  "source": "weaver"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event` | `string` | Hook event name: `agentSpawn`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop` |
| `activity` | `string` | Derived status: `starting`, `processing`, `running_tool`, `pending_approval`, `idle` |
| `timestamp` | `string` | ISO 8601 timestamp of when the webhook was dispatched |
| `session.id` | `string` | Session UUID |
| `session.name` | `string` | Custom name or directory name fallback |
| `session.pid` | `number` | kiro-cli process ID |
| `session.cwd` | `string` | Working directory of the session |
| `context` | `object \| null` | Event-specific data (see below) |
| `source` | `"weaver"` | Static identifier |

### Context by event type

| Event | `context` contents |
|-------|-------------------|
| `agentSpawn`, `stop` | `null` |
| `userPromptSubmit` | `{ prompt }` |
| `preToolUse` | `{ prompt, tool_name, tool_input }` |
| `postToolUse` | `{ prompt, tool_name, tool_input, tool_response }` |
| `pending_approval` | Same as `preToolUse` |

### Pending approval

When a `preToolUse` event is not resolved by a `postToolUse` or `stop` within 15 seconds, a second webhook fires with `activity: "pending_approval"`. The `event` field remains `preToolUse`.

### Delivery

- Fire-and-forget: no retries, no delivery guarantees
- 5-second timeout per request
- Failures are logged server-side but never block the event pipeline

## Data Directory

All session data is stored in `~/.weaver/`:

| Path | Description |
|------|-------------|
| `sessions.jsonl` | Session index (one JSON line per session) |
| `logs/<session-id>.jsonl` | Per-session event logs |
| `.current-session-<pid>` | Temporary marker files mapping kiro-cli PIDs to session IDs |
| `config.json` | User configuration (see [`config.example.json`](config.example.json) for defaults) |
