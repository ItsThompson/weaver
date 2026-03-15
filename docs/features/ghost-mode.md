# Ghost mode

Ghost mode makes the Weaver window transparent and click-through, so you can overlay it on top of your editor or terminal without it blocking interaction.

## Toggling ghost mode

From the CLI:

```bash
weaver config ghost        # Toggle on/off
weaver config ghost on     # Enable
weaver config ghost off    # Disable
```

From the tray menu: click the tray icon and toggle **Ghost Mode**.

From the dashboard: go to **Settings** and toggle ghost mode.

## Adjusting opacity

```bash
weaver config ghost opacity 0.3   # More transparent
weaver config ghost opacity 0.7   # More opaque
```

Opacity accepts a value between 0 (fully transparent) and 1 (fully opaque). The default is `0.5`.

## Behavior

When ghost mode is active:

- The window becomes semi-transparent at the configured opacity
- Mouse clicks pass through the window to whatever is behind it
- The window stays always-on-top

To interact with the Weaver window again, disable ghost mode via the tray menu or CLI.
