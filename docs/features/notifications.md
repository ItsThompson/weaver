# Notifications

Weaver provides sound and visual notifications when session events occur, so you know when the agent has finished a turn or needs your attention.

## Sound notifications

Enabled by default. Toggle via:

```bash
weaver config sounds        # Toggle on/off
weaver config sounds on     # Enable
weaver config sounds off    # Disable
```

Or from the **Settings** page in the dashboard.

## Visual notifications

The dashboard shows a notification bar at the bottom of the screen when events occur in sessions you're not currently viewing. Notifications auto-dismiss after 15 seconds, and up to 3 are shown at a time.

## Activity indicators

The sessions list shows real-time activity status for open sessions:

- **Starting**: Session just spawned
- **Idle**: Agent is waiting for input
- **Processing**: Agent is thinking
- **Running tool**: Agent is executing a tool call
- **Pending approval**: Agent is waiting for user approval (detected after 15 seconds of inactivity on a tool call)
