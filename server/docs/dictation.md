# Dictation API

## GET /api/dictation/history

List all past dictation entries in reverse chronological order (newest first).

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "entries": [
    {
      "timestamp": "2026-04-05T18:01:00.000Z",
      "rawTranscript": "um hello how are you",
      "processedText": "Hello, how are you?"
    },
    {
      "timestamp": "2026-04-05T18:00:00.000Z",
      "rawTranscript": "my email",
      "processedText": "user@example.com"
    }
  ]
}
```

| Field                     | Type   | Description                         |
| ------------------------- | ------ | ----------------------------------- |
| `entries[].timestamp`     | string | ISO 8601 timestamp of the dictation |
| `entries[].rawTranscript` | string | Original speech-to-text output      |
| `entries[].processedText` | string | Cleaned or snippet-expanded text    |

Returns `{ "entries": [] }` when no dictation history exists.

---

## POST /api/dictation/transcribe

Transcribe an audio buffer using whisper-server.

### Request

**Content-Type:** `application/octet-stream`

Body: raw WAV audio data (16kHz, 16-bit, mono).

### Response

**Status:** `200 OK`

```json
{
  "text": "hello this is a test"
}
```

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "No audio data received"
}
```

**Status:** `503 Service Unavailable`

```json
{
  "error": "Whisper is not available. Check service status."
}
```

---

## POST /api/dictation/process

Process a raw transcript: apply snippet matching first, then LLM cleanup if no snippet matched and LLM cleanup is enabled. Logs the result to dictation history.

### Request Body

```json
{
  "transcript": "um hello this is a test you know",
  "snippets": [
    { "id": "abc", "trigger": "signature", "expansion": "Best regards,\nJane" }
  ]
}
```

| Parameter    | Type      | Required | Description               |
| ------------ | --------- | -------- | ------------------------- |
| `transcript` | string    | Yes      | Raw transcript text       |
| `snippets`   | Snippet[] | No       | Snippets to match against |

### Response

**Status:** `200 OK`

When a snippet matches:

```json
{
  "processedText": "Best regards,\nJane",
  "snippetUsed": "signature"
}
```

When LLM cleanup runs:

```json
{
  "processedText": "Hello, this is a test.",
  "snippetUsed": null
}
```

When LLM cleanup is disabled and no snippet matches:

```json
{
  "processedText": "um hello this is a test you know",
  "snippetUsed": null
}
```

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "transcript is required"
}
```

**Status:** `503 Service Unavailable`

```json
{
  "error": "Ollama is not available. Check service status."
}
```

Returned when `llm_cleanup` is enabled and ollama is not running.

---

## GET /api/dictation/models

List available whisper models and which ones are downloaded locally.

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "available": [
    {
      "name": "Tiny (English)",
      "size": "75 MB",
      "filename": "ggml-tiny.en.bin",
      "url": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"
    },
    {
      "name": "Base (English)",
      "size": "142 MB",
      "filename": "ggml-base.en.bin",
      "url": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
    },
    {
      "name": "Small (English)",
      "size": "466 MB",
      "filename": "ggml-small.en.bin",
      "url": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"
    }
  ],
  "local": ["ggml-base.en.bin"]
}
```

---

## POST /api/dictation/models/download

Download a whisper model from Hugging Face. Streams progress via SSE.

### Request Body

```json
{
  "filename": "ggml-base.en.bin"
}
```

| Parameter  | Type   | Required | Description                       |
| ---------- | ------ | -------- | --------------------------------- |
| `filename` | string | Yes      | Filename of the model to download |

### Response

**Content-Type:** `text/event-stream`

Progress events:

```
data: {"progress":25}

data: {"progress":50}

data: {"progress":100}

data: {"complete":true}
```

### Errors

**Status:** `400 Bad Request`

```json
{
  "error": "Unknown model: bad-model.bin"
}
```
