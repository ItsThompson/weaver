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

## Data Directory

All session data is stored in `~/.weaver/`:

| Path | Description |
|------|-------------|
| `sessions.jsonl` | Session index (one JSON line per session) |
| `logs/<session-id>.jsonl` | Per-session event logs |
| `.current-session-<pid>` | Temporary marker files mapping kiro-cli PIDs to session IDs |
| `config.json` | User configuration (see [`config.example.json`](config.example.json) for defaults) |
