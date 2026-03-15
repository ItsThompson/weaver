# Webhooks

Weaver can POST event payloads to an external URL (Slack, Discord, or any webhook endpoint) when session events occur.

## Setup

1. Open the Weaver dashboard and go to **Settings**
2. Set the **Webhook URL** to your endpoint
3. Choose a **Webhook format**: `simple` or `advanced`

Or configure via `~/.weaver/config.json`:

```json
{
  "webhook_url": "https://hooks.slack.com/services/...",
  "webhook_format": "simple"
}
```

Or via the CLI:

```bash
weaver config webhook_url "https://hooks.slack.com/services/..."
```

## Formats

### Simple

A human-readable text summary of the event, suitable for Slack or Discord incoming webhooks.

### Advanced

A structured JSON payload containing the full event data, suitable for custom integrations.

## Per-session control

Webhooks can be enabled or disabled per session from the session detail page in the dashboard. This is useful when you want notifications for some sessions but not others.
