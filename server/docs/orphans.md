# Orphans API

## GET /api/orphans

List orphaned event groups (events from PIDs that couldn't be matched to a session).

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "groups": [
    {
      "pid": 99999,
      "turns": [],
      "eventCount": 12,
      "timeRange": {
        "start": "2026-03-15T10:00:00Z",
        "end": "2026-03-15T10:05:00Z"
      }
    }
  ]
}
```

---

## GET /api/orphans/count

Get the total number of orphaned events.

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "count": 12
}
```

---

## POST /api/orphans/assign

Assign orphaned events to an existing session.

### Request Body

```json
{
  "targetSessionId": "abc123",
  "pid": 99999
}
```

| Parameter         | Type   | Required | Description                    |
| ----------------- | ------ | -------- | ------------------------------ |
| `targetSessionId` | string | Yes      | Session ID to assign events to |
| `pid`             | number | Yes      | PID of the orphan group        |

### Response

**Status:** `200 OK`

```json
{
  "ok": true
}
```

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "targetSessionId and pid are required"
}
```

**Status:** `404 Not Found`

```json
{
  "error": "Target session not found"
}
```

---

## DELETE /api/orphans/:pid

Delete all orphaned events for a specific PID.

### Parameters

| Parameter | In   | Type   | Required | Description                       |
| --------- | ---- | ------ | -------- | --------------------------------- |
| `pid`     | path | number | Yes      | PID of the orphan group to delete |

### Response

**Status:** `200 OK`

```json
{
  "ok": true
}
```

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "Invalid PID"
}
```

**Status:** `404 Not Found`

```json
{
  "error": "No orphan events found for PID 99999"
}
```
