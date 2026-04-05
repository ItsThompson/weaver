# Dictation

Dictation lets you speak into your microphone and get cleaned-up text, entirely offline. Weaver transcribes your speech in real time using a local whisper model, then optionally runs the transcript through a local LLM to fix grammar, add punctuation, and remove filler words.

This feature is only available in the desktop app (Electron). It does not appear in browser dev mode.

## Prerequisites

Before using dictation, you need two things installed on your Mac:

1. **Ollama** (optional, for LLM cleanup): install via `brew install ollama`, then pull a model:

   ```bash
   ollama pull phi4-mini
   ```

2. **A whisper model**: downloaded automatically through the Dictation page on first use (see [Model download](#model-download) below).

Ollama must be running for LLM cleanup to work. If you disable LLM cleanup in settings, Ollama is not required.

## Dictation page

Open **Dictation** from the sidebar or command palette.

### Preflight checks

The page shows status indicators for two services:

- **Whisper**: green when a whisper model is available (the whisper server starts automatically when you begin dictation)
- **Ollama**: green when the Ollama server is reachable

Both must be green for the Start button to be enabled. If Ollama is not needed (LLM cleanup disabled), only Whisper needs to be ready.

### Recording

1. Click **Start Dictation**
2. Speak into your microphone. The "Raw Transcript" area updates every few seconds with transcribed text.
3. Click **Stop Dictation** when finished
4. Weaver processes the full transcript: if a [snippet](snippets.md) matches, its expansion is used. Otherwise, the LLM cleans up the text (if enabled).
5. The result appears in the "Processed Output" area
6. Click **Copy to Clipboard** to copy the processed text

### Model download

If no whisper model has been downloaded yet, the Dictation page shows a model selection screen instead of the recording controls. Three models are available:

| Model           | Size   | Notes                                   |
| --------------- | ------ | --------------------------------------- |
| Tiny (English)  | 75 MB  | Fastest, lowest accuracy                |
| Base (English)  | 142 MB | Good balance of speed and accuracy      |
| Small (English) | 466 MB | Best accuracy, slower on older hardware |

Click **Download** next to a model. A progress bar shows the download status. After the download completes, the page automatically transitions to the normal dictation view.

Models are stored in `~/.weaver/models/`.

## Hotkey quick capture

Press the dictation hotkey (default: **F4**) from anywhere (even when Weaver is not focused) to start a headless dictation:

1. **First press**: a macOS notification appears saying "Listening..." and audio capture begins
2. **Second press**: a notification says "Processing..." and the transcript is sent through the cleanup pipeline
3. When processing finishes: the result is copied to your clipboard and a notification confirms "Copied to clipboard!"

The hotkey flow works independently of the Dictation page. If the Dictation page is open while the hotkey is active, its controls are disabled and an info banner is shown.

## LLM cleanup

When LLM cleanup is enabled (the default), Weaver sends the raw transcript to Ollama for post-processing. The LLM:

- Adds punctuation and capitalization
- Fixes grammar errors
- Removes filler words (um, uh, like, you know)
- Preserves the original meaning and wording

When LLM cleanup is disabled, the raw whisper transcript is used as-is. Whisper already adds basic punctuation, so this mode is usable for quick captures where latency matters more than polish.

Toggle LLM cleanup from **Settings** > **Dictation** > **LLM Cleanup**.

## Configuration

Dictation settings are available on the **Settings** page under the "Dictation" heading (desktop app only). See [configuration](../configuration.md) for the full options reference.

## Dictation history

Every completed dictation is logged to `~/.weaver/dictations.jsonl` with the timestamp, raw transcript, and processed text.

## Sounds

Three sounds play during the dictation flow:

- A rising tone when recording starts
- A falling tone when recording stops
- An ascending chime when processing completes and text is copied
