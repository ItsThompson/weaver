# Config API

## GET /api/config

Read the current configuration.

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "config": {
    "enable_notification_sounds": true,
    "open_display_options": [
      "pid",
      "customName",
      "activity",
      "cwd",
      "agentName",
      "startTime",
      "lastEventTime",
      "actions"
    ],
    "close_display_options": [
      "customName",
      "cwd",
      "agentName",
      "startTime",
      "lastEventTime",
      "actions"
    ],
    "page_size": 25,
    "dark_mode": true,
    "ghost_mode": false,
    "ghost_opacity": 0.5,
    "webhook_url": "",
    "webhook_format": "simple",
    "test_runners": []
  },
  "warnings": []
}
```

---

## PUT /api/config

Replace the entire configuration.

### Request Body

Full `WeaverConfig` object:

```json
{
  "enable_notification_sounds": true,
  "open_display_options": ["pid", "customName", "activity"],
  "close_display_options": ["customName", "cwd"],
  "page_size": 25,
  "dark_mode": true,
  "ghost_mode": false,
  "ghost_opacity": 0.5,
  "webhook_url": "",
  "webhook_format": "simple",
  "test_runners": []
}
```

### Response

**Status:** `200 OK`

```json
{
  "config": { ... }
}
```

### Error

**Status:** `422 Unprocessable Entity`

```json
{
  "error": "ghost_opacity must be a number between 0 and 1"
}
```

---

## PATCH /api/config

Merge-update specific configuration fields. Only the provided fields are changed; all others keep their current values.

### Request Body

Partial `WeaverConfig` object:

```json
{
  "dark_mode": false,
  "ghost_opacity": 0.7
}
```

### Response

**Status:** `200 OK`

```json
{
  "config": { ... }
}
```

### Error

**Status:** `422 Unprocessable Entity`

```json
{
  "error": "ghost_opacity must be a number between 0 and 1"
}
```
