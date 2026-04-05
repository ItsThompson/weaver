# Dictation API

## GET /api/dictation/status

Pre-flight check for dictation services.

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "whisper": true,
  "ollama": true,
  "model": "/Users/you/.weaver/models/ggml-base.en.bin"
}
```

| Field     | Type           | Description                                         |
| --------- | -------------- | --------------------------------------------------- |
| `whisper` | boolean        | Whether whisper-server is running or a model exists |
| `ollama`  | boolean        | Whether the Ollama server is reachable              |
| `model`   | string \| null | Path to the default whisper model, or null if none  |

---

## POST /api/dictation/transcribe

Transcribe an audio buffer using whisper-server. Starts whisper-server on demand if it is not already running.

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

**Status:** `500 Internal Server Error`

```json
{
  "error": "Whisper server is not available"
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
