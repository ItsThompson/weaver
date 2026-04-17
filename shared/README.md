# @weaver/shared

Shared TypeScript types, constants, and utilities used across all Weaver packages.

## Development

```bash
# Build
npm run build --prefix shared
```

## Exports

| Import path                       | Description                                                |
| --------------------------------- | ---------------------------------------------------------- |
| `@weaver/shared/types`            | All types (sessions, events, config, validation)           |
| `@weaver/shared/session`          | Session types                                              |
| `@weaver/shared/events`           | Hook event and turn group types                            |
| `@weaver/shared/config`           | Config types and defaults                                  |
| `@weaver/shared/utils`            | Utility functions                                          |
| `@weaver/shared/paths`            | Path utilities for `~/.weaver/` data directory             |
| `@weaver/shared/sync`             | Project config reading and timeout calculation             |
| `@weaver/shared/logger`           | Structured JSONL logger factory                            |
| `@weaver/shared/adapter-registry` | Harness adapter registry (`registerAdapter`, `getAdapter`) |
| `@weaver/shared/log-event`        | Shared log-event utility for writing canonical events      |
