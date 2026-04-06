# Services API

## GET /api/services/status

Per-service readiness status. No side effects: does not start or stop any services.

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "ready": true,
  "services": {
    "whisper": { "state": "running" },
    "ollama": { "state": "running" }
  }
}
```

| Field                    | Type    | Description                                                                                                                                   |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`                  | boolean | `true` when all configured services have reached a terminal state (`running`, `error`, or `not_configured`). `false` while any is `starting`. |
| `services.whisper.state` | string  | One of `running`, `starting`, `stopped`, `error`, `not_configured`                                                                            |
| `services.whisper.error` | string  | Present when state is `error`. Describes what went wrong.                                                                                     |
| `services.ollama.state`  | string  | One of `running`, `starting`, `stopped`, `error`, `not_configured`                                                                            |
| `services.ollama.error`  | string  | Present when state is `error`. Describes what went wrong.                                                                                     |

### Example: all running

```json
{
  "ready": true,
  "services": {
    "whisper": { "state": "running" },
    "ollama": { "state": "running" }
  }
}
```

### Example: partially configured

```json
{
  "ready": true,
  "services": {
    "whisper": { "state": "running" },
    "ollama": { "state": "not_configured" }
  }
}
```

### Example: error state

```json
{
  "ready": true,
  "services": {
    "whisper": { "state": "error", "error": "Whisper failed to start" },
    "ollama": { "state": "running" }
  }
}
```
