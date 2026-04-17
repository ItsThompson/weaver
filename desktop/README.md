# weaver-electron

Electron desktop wrapper for Weaver. Bundles the server and client into a standalone macOS app with a tray icon and global hotkey.

## Development

```bash
# Build and launch
npm run app

# Dev mode (build + launch without packaging)
npm run dev --prefix desktop

# Package into .app / .dmg
npm run dist
```

## Features

- **Global hotkey**: Press `F5` to show/hide the Weaver window
- **Tray icon**: Access show/hide, ghost mode, and mini mode from the menu bar
- **Ghost mode**: Transparent click-through overlay. See [ghost mode](../docs/features/ghost-mode.md).
- **Mini mode**: Compact session list panel. See [mini mode](../docs/features/mini-mode.md).
- **Always-on-top**: Window stays above other windows
- **Embedded server**: The Electron app starts the Weaver server automatically
- **Hook installation**: Automatically symlinks binding hook scripts to `/usr/local/lib/weaver/` on startup (may prompt for admin privileges)
