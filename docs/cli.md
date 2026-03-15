# CLI reference

The `weaver` command lets you control the dashboard from inside kiro-cli sessions.

## Usage

```
weaver <command> [options]
```

## Commands

### `weaver view`

Navigate the dashboard to the current kiro-cli session.

```bash
weaver view
```

### `weaver session`

Navigate the dashboard to the sessions list.

```bash
weaver session          # Open sessions list
weaver session list     # Same as above
weaver session <PID>    # Open a specific session by PID
```

### `weaver rename <name>`

Rename the current kiro-cli session.

```bash
weaver rename "auth refactor"
```

### `weaver toggle`

Toggle between main dashboard and mini mode.

```bash
weaver toggle
```

### `weaver config`

Change dashboard settings.

```bash
weaver config ghost             # Toggle ghost mode
weaver config ghost on          # Enable ghost mode
weaver config ghost off         # Disable ghost mode
weaver config ghost opacity 0.7 # Set ghost opacity (0 to 1)

weaver config dark              # Toggle dark mode
weaver config dark on           # Enable dark mode
weaver config dark off          # Disable dark mode

weaver config sounds            # Toggle notification sounds
weaver config sounds on         # Enable notification sounds
weaver config sounds off        # Disable notification sounds
```

## Notes

- The CLI communicates with the Weaver server at `http://localhost:8143` by default. Override with the `WEAVER_SERVER` environment variable.
- The CLI automatically resolves the calling kiro-cli process ID, so commands like `view` and `rename` target the correct session.
