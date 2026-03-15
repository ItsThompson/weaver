# weaver-cli

CLI tool for controlling the Weaver dashboard from inside kiro-cli sessions.

## Installation

```bash
ln -s ~/Documents/weaver/bin/weaver /usr/local/bin/weaver
```

## Development

```bash
# Build
npm run build --prefix cli

# Run tests
npm test --prefix cli
```

## Commands

See the full [CLI reference](../docs/cli.md) for usage details.

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| `weaver view`          | Navigate dashboard to the current session |
| `weaver session`       | Navigate to the sessions list             |
| `weaver session <PID>` | Navigate to a specific session            |
| `weaver rename <name>` | Rename the current session                |
| `weaver toggle`        | Toggle between main and mini mode         |
| `weaver config ghost`  | Toggle ghost mode                         |
| `weaver config dark`   | Toggle dark mode                          |
| `weaver config sounds` | Toggle notification sounds                |
