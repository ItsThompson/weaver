# Snippets API

## GET /api/snippets

List all snippets.

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "snippets": [
    {
      "id": "a1b2c3d4",
      "trigger": "signature",
      "expansion": "Best regards,\nJane Smith"
    }
  ]
}
```

---

## POST /api/snippets

Create a new snippet.

### Request Body

```json
{
  "trigger": "signature",
  "expansion": "Best regards,\nJane Smith"
}
```

| Parameter   | Type   | Required | Description                       |
| ----------- | ------ | -------- | --------------------------------- |
| `trigger`   | string | Yes      | Phrase that activates the snippet |
| `expansion` | string | Yes      | Text to insert when triggered     |

### Response

**Status:** `201 Created`

```json
{
  "snippet": {
    "id": "a1b2c3d4",
    "trigger": "signature",
    "expansion": "Best regards,\nJane Smith"
  }
}
```

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "trigger is required"
}
```

---

## PUT /api/snippets/:id

Update an existing snippet.

### Parameters

| Parameter | In   | Type   | Required | Description |
| --------- | ---- | ------ | -------- | ----------- |
| `id`      | path | string | Yes      | Snippet ID  |

### Request Body

```json
{
  "trigger": "sign off",
  "expansion": "Cheers,\nJane"
}
```

| Parameter   | Type   | Required | Description        |
| ----------- | ------ | -------- | ------------------ |
| `trigger`   | string | Yes      | New trigger phrase |
| `expansion` | string | Yes      | New expansion text |

### Response

**Status:** `200 OK`

```json
{
  "snippet": {
    "id": "a1b2c3d4",
    "trigger": "sign off",
    "expansion": "Cheers,\nJane"
  }
}
```

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "trigger is required"
}
```

**Status:** `404 Not Found`

```json
{
  "error": "Snippet not found"
}
```

---

## DELETE /api/snippets/:id

Delete a snippet.

### Parameters

| Parameter | In   | Type   | Required | Description |
| --------- | ---- | ------ | -------- | ----------- |
| `id`      | path | string | Yes      | Snippet ID  |

### Response

**Status:** `204 No Content`

### Errors

**Status:** `404 Not Found`

```json
{
  "error": "Snippet not found"
}
```
