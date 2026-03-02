# Weaver

A local developer tool that provides observability and conversation editing capabilities on top of kiro-cli.

## Features

- **Observability**: View conversation logs, tool usage, and session history through a web dashboard
- **Cherrypick**: Select and remove parts of a conversation, then reload a pruned context via `/chat load`

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

# Install hook handler (see hook-handler/README.md for details)
ln -s ~/Documents/weaver/hook-handler/weaver-log.sh ~/.config/amazonq/global/hooks/weaver-log.sh
chmod +x hook-handler/weaver-log.sh

# Install CLI dependencies
npm install --prefix cli

# Add aliases (add to ~/.zshrc or ~/.bashrc)
alias weaver='~/Documents/weaver/bin/weaver'
alias wv='weaver view'
```

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

## Data Directory

All session data is stored in `~/.weaver/`:

| Path | Description |
|------|-------------|
| `sessions.jsonl` | Session index (one JSON line per session) |
| `logs/<session-id>.jsonl` | Per-session event logs |
| `.current-session-<pid>` | Temporary marker files mapping kiro-cli PIDs to session IDs |
