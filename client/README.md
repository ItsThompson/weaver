# weaver-client

React dashboard UI for Weaver, built with [Cloudscape Design System](https://cloudscape.design/).

## Development

```bash
# Run with Vite hot reload (requires the server running separately)
npm run dev

# Build
npm run build --prefix client

# Run tests
npm test --prefix client
```

When running `npm run dev` from the monorepo root, both the server and client start together.

## Pages

| Page           | Path                | Description                                                 |
| -------------- | ------------------- | ----------------------------------------------------------- |
| Sessions       | `/`                 | List of all sessions with activity status                   |
| Session detail | `/sessions/:id`     | Conversation turns, tool calls, and validation results      |
| Cherrypick     | `/cherrypick`       | Select and prune conversation turns                         |
| Orphans        | `/sessions/orphans` | Manage events from unmatched PIDs                           |
| Settings       | `/settings`         | Configure display options, webhooks, and preferences        |
| Mini           | `/mini`             | Compact session list (used by mini mode in the desktop app) |

## Keyboard shortcuts

- `Cmd+K`: Open command palette
