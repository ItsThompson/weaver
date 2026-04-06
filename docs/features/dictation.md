# Dictation

Dictation lets you speak into your microphone and get cleaned-up text, entirely offline. Weaver transcribes your speech in real time using a local whisper model, then optionally runs the transcript through a local LLM to fix grammar, add punctuation, and remove filler words.

This feature is only available in the desktop app (Electron). It does not appear in browser dev mode.

## Enabling dictation

Dictation is disabled by default. To enable it, go to **Settings** > **Dictation** and toggle **Enable dictation** on. This starts the whisper speech recognition server on app launch. If LLM cleanup is also enabled, Ollama starts alongside whisper.

When you change the `enable_dictation` toggle (or other service-affecting settings like `llm_cleanup`, `ollama_url`, or `ollama_model`), a confirmation dialog appears before saving. After confirming, the app briefly returns to the startup screen while services reinitialize.

## Startup status

When the app launches with dictation enabled, a startup status page shows a checklist of service readiness:

- Each configured service displays a status icon: a checkmark for running, a spinner for starting, or an error icon for failures
- Once all services have reached a final state (running, error, or not configured), the app transitions to the normal dashboard
- If a service fails to start, the app still proceeds: you can check the error in Settings
- If services take longer than 30 seconds, a "Skip and continue" link appears

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

### Service status

When dictation is disabled, the page shows an info message directing you to Settings. When enabled but a service has an error, an error alert is shown.

If no whisper model has been downloaded, the page shows the model download screen (see below). Otherwise, the recording controls are shown.

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

Press the dictation hotkey (default: **F4**) from anywhere (even when Weaver is not focused) to start a headless dictation. The hotkey checks whether dictation is enabled and services are ready before starting. If dictation is disabled, a notification tells you to enable it in Settings. If services are still starting, a notification asks you to wait.

When conditions are met:

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

To view past dictations, open the **Actions** dropdown on the Dictation page and select **Dictation History**. The history page shows all entries newest first, with the processed text visible on each card and the raw transcript behind an expandable section.

## Sounds

Three sounds play during the dictation flow:

- A rising tone when recording starts
- A falling tone when recording stops
- An ascending chime when processing completes and text is copied
