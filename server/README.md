# weaver-server

Fastify API server that powers the Weaver dashboard. Reads session data from `~/.weaver/`, serves the client UI, and provides real-time updates via SSE.

## Development

```bash
# Run with hot reload
npm run dev --prefix server

# Build
npm run build --prefix server

# Run tests
npm test --prefix server
```

The server listens on port `8143`.

## API overview

| Endpoint                              | Description                                     |
| ------------------------------------- | ----------------------------------------------- |
| `GET /api/health`                     | Health check                                    |
| `GET /api/sessions`                   | List all sessions                               |
| `GET /api/sessions/:id`               | Session detail with conversation turns          |
| `PATCH /api/sessions/:id`             | Rename a session                                |
| `DELETE /api/sessions/:id`            | Delete a session                                |
| `POST /api/rename`                    | Rename a session by PID                         |
| `POST /api/sessions/:id/webhook`      | Enable/disable webhooks for a session           |
| `POST /api/view`                      | Navigate dashboard to a session by PID          |
| `POST /api/navigate`                  | Navigate dashboard to a page                    |
| `POST /api/notify`                    | Receive event notifications from hook scripts   |
| `GET /api/events`                     | SSE stream for real-time updates                |
| `GET /api/config`                     | Read config                                     |
| `PUT /api/config`                     | Replace config                                  |
| `PATCH /api/config`                   | Merge-update config                             |
| `GET /api/skills`                     | List all skills as a graph (nodes + edges)      |
| `GET /api/skills/:name`               | Get a single skill's detail (?project, ?source) |
| `GET /api/orphans`                    | List orphaned event groups                      |
| `GET /api/orphans/count`              | Count orphaned events                           |
| `POST /api/orphans/assign`            | Assign orphan events to a session               |
| `DELETE /api/orphans/:pid`            | Delete orphan events by PID                     |
| `GET /api/snippets`                   | List all snippets                               |
| `POST /api/snippets`                  | Create a snippet                                |
| `PUT /api/snippets/:id`               | Update a snippet                                |
| `DELETE /api/snippets/:id`            | Delete a snippet                                |
| `GET /api/services/status`            | Per-service readiness status                    |
| `GET /api/dictation/history`          | List dictation history (newest first)           |
| `POST /api/dictation/transcribe`      | Transcribe audio via whisper-server             |
| `POST /api/dictation/process`         | Process transcript (snippet matching + LLM)     |
| `GET /api/dictation/models`           | List available and downloaded whisper models    |
| `POST /api/dictation/models/download` | Download a whisper model (SSE progress)         |

Full request/response documentation for each endpoint is in the [`docs/`](docs/) directory:

- [Health](docs/health.md)
- [Sessions](docs/sessions.md)
- [Events](docs/events.md)
- [Config](docs/config.md)
- [Skills](docs/skills.md)
- [Orphans](docs/orphans.md)
- [Snippets](docs/snippets.md)
- [Dictation](docs/dictation.md)
- [Services](docs/services.md)
