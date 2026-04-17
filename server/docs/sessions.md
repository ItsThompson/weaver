# Sessions API

## GET /api/sessions

List all sessions, sorted by start time (newest first).

### Parameters

None.

### Response

**Status:** `200 OK`

```json
[
  {
    "id": "abc123",
    "pid": 12345,
    "customName": "auth refactor",
    "cwd": "/Users/me/project",
    "agentName": "dev",
    "startTime": "2026-03-15T10:00:00Z",
    "lastEventTime": "2026-03-15T10:05:00Z",
    "harness": "kiro-cli",
    "status": "open",
    "activity": "idle"
  }
]
```

`status` is `"open"` or `"closed"`. `activity` is only present for open sessions and is one of: `"starting"`, `"idle"`, `"processing"`, `"running_tool"`, `"pending_approval"`. `harness` identifies which AI coding assistant produced the session (e.g., `"kiro-cli"`, `"claude-code"`).

---

## GET /api/sessions/:id

Get session detail with conversation turns.

### Parameters

| Parameter | In   | Type   | Required | Description |
| --------- | ---- | ------ | -------- | ----------- |
| `id`      | path | string | Yes      | Session ID  |

### Response

**Status:** `200 OK`

```json
{
  "session": {
    "id": "abc123",
    "pid": 12345,
    "customName": "auth refactor",
    "cwd": "/Users/me/project",
    "agentName": "dev",
    "startTime": "2026-03-15T10:00:00Z",
    "lastEventTime": "2026-03-15T10:05:00Z",
    "harness": "kiro-cli",
    "status": "open",
    "activity": "idle"
  },
  "turns": [
    {
      "id": 1,
      "userPrompt": "Fix the login bug",
      "events": [],
      "toolCalls": [
        {
          "toolName": "fs_read",
          "input": { "path": "src/auth.ts" },
          "response": { "success": true, "result": [] },
          "startTime": "2026-03-15T10:00:01Z",
          "endTime": "2026-03-15T10:00:02Z"
        }
      ],
      "startTime": "2026-03-15T10:00:00Z",
      "endTime": "2026-03-15T10:00:05Z",
      "validationResults": []
    }
  ],
  "webhookEnabled": true,
  "activeSkills": [],
  "configuredSkills": []
}
```

### Error

**Status:** `404 Not Found`

```json
{
  "error": "Session not found"
}
```

---

## PATCH /api/sessions/:id

Rename a session.

### Parameters

| Parameter    | In   | Type   | Required | Description      |
| ------------ | ---- | ------ | -------- | ---------------- |
| `id`         | path | string | Yes      | Session ID       |
| `customName` | body | string | Yes      | New session name |

### Request Body

```json
{
  "customName": "auth refactor"
}
```

### Response

**Status:** `200 OK`

Returns the updated session object.

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "customName must be a string"
}
```

**Status:** `404 Not Found`

```json
{
  "error": "Session not found"
}
```

---

## DELETE /api/sessions/:id

Delete a session and its log file.

### Parameters

| Parameter | In   | Type   | Required | Description |
| --------- | ---- | ------ | -------- | ----------- |
| `id`      | path | string | Yes      | Session ID  |

### Response

**Status:** `200 OK`

```json
{
  "ok": true
}
```

### Error

**Status:** `404 Not Found`

```json
{
  "error": "Session not found"
}
```

---

## POST /api/rename

Rename a session by PID (used by the CLI).

### Request Body

```json
{
  "pid": 12345,
  "customName": "auth refactor"
}
```

### Response

**Status:** `200 OK`

Returns the updated session object.

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "pid required"
}
```

**Status:** `404 Not Found`

```json
{
  "error": "No session found for PID"
}
```

---

## POST /api/sessions/:id/webhook

Enable or disable webhooks for a specific session.

### Parameters

| Parameter | In   | Type    | Required | Description                  |
| --------- | ---- | ------- | -------- | ---------------------------- |
| `id`      | path | string  | Yes      | Session ID                   |
| `enabled` | body | boolean | Yes      | Whether webhooks are enabled |

### Request Body

```json
{
  "enabled": true
}
```

### Response

**Status:** `200 OK`

```json
{
  "ok": true,
  "enabled": true
}
```

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "enabled must be a boolean"
}
```

**Status:** `404 Not Found`

```json
{
  "error": "Session not found"
}
```
