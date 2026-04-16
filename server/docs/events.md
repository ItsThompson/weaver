# Events API

## POST /api/notify

Notify the server of a session event (used by hook scripts).

### Request Body

```json
{
  "sessionId": "abc123",
  "eventName": "stop"
}
```

| Parameter   | Type   | Required | Description     |
| ----------- | ------ | -------- | --------------- |
| `sessionId` | string | Yes      | Session ID      |
| `eventName` | string | No       | Hook event name |

### Response

**Status:** `200 OK`

```json
{
  "ok": true
}
```

### Error

**Status:** `400 Bad Request`

```json
{
  "error": "sessionId required"
}
```

---

## POST /api/view

Navigate the dashboard to a session by PID (used by the CLI).

### Request Body

```json
{
  "pid": 12345
}
```

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| `pid`     | number | Yes      | Process ID of the session |

### Response

**Status:** `200 OK`

```json
{
  "ok": true,
  "sessionId": "abc123"
}
```

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

## POST /api/navigate

Navigate the dashboard to a specific page (used by the CLI).

### Request Body

```json
{
  "page": "sessions"
}
```

| Parameter | Type   | Required | Description                                              |
| --------- | ------ | -------- | -------------------------------------------------------- |
| `page`    | string | Yes      | Page to navigate to (`"sessions"`, `"mini"`, `"toggle"`) |

### Response

**Status:** `200 OK`

```json
{
  "ok": true
}
```

### Error

**Status:** `400 Bad Request`

```json
{
  "error": "page required"
}
```

---

## GET /api/events

Server-Sent Events (SSE) stream for real-time dashboard updates.

### Parameters

None.

### Response

**Status:** `200 OK`

**Content-Type:** `text/event-stream`

Events are sent as SSE messages with `event` and `data` fields:

```
event: sessionUpdated
data: {"sessionId":"abc123"}

event: navigate
data: {"sessionId":"abc123"}

event: configChanged
data: {"dark_mode":true,"ghost_mode":false,...}
```
