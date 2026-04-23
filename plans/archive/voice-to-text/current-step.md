# Implementation Plan: Local Voice-to-Text with LLM Post-Processing

## OVERVIEW

### Description

Add a fully local, offline voice-to-text dictation system to the Weaver Electron app. Users speak into their microphone, see a live raw transcript updated in chunks, then receive LLM-cleaned output (grammar, punctuation, filler removal). Includes a snippet system for voice-triggered text expansion, a global F4 hotkey for headless quick-capture, and a model download UI for first-run setup.

### Success Criteria

- User can start/stop dictation on the Dictation page and see live raw transcript + processed output
- F4 global hotkey captures audio, processes it, and copies result to clipboard with native macOS notifications and sounds
- Pre-flight checks verify whisper-server and Ollama availability before allowing dictation
- Snippets can be created/edited/deleted on a dedicated page and trigger via exact voice match
- Whisper model downloads on first use with progress indication
- Entire pipeline works offline (after initial model download)
- Dictation page, Snippets page, sidebar links, and command palette entries are hidden in the web version
- Dictation history is logged to `~/.weaver/dictations.jsonl`

### Assumptions & Constraints

- Target: macOS Apple Silicon only
- User must install Ollama separately and pull a model (recommended: `phi4-mini`)
- whisper-server binary is bundled with the app (built from whisper.cpp source as part of `npm run dist`)
- whisper-server runs on hardcoded port 8178, managed as a child process by the Weaver server
- Audio captured via Web Audio API AudioWorklet in the renderer, proxied through Weaver server to whisper-server
- "Streaming" is simulated via 3-5 second audio chunks (not word-level)
- Whisper-server starts on-demand and shuts down after 5 minutes of inactivity
- Snippet matching: filter to alpha characters, case-insensitive, whole-transcript match only. Multiple matches = all ignored.

## APPROACH

### High-Level Solution Design

The feature spans all packages in the monorepo:

1. **shared**: New types for dictation config, snippets, dictation history. New paths for `snippets.jsonl`, `dictations.jsonl`, `models/`.
2. **server**: Whisper-server lifecycle management (spawn/kill/health/timeout). Proxy routes for transcription and LLM processing. Snippets CRUD routes. Model download route with progress streaming. Dictation history logging.
3. **desktop**: Build script for whisper-server binary. Updated electron-builder config. F4 global shortcut. IPC handlers for dictation lifecycle. Native macOS notifications. Clipboard access. Preload bridge extensions.
4. **client**: AudioWorklet processor for mic capture. Dictation page with pre-flight checks, live transcript, processed output. Snippets page with CRUD UI. Settings page additions for dictation config. Sidebar/command palette updates gated by `isElectron()`. New dictation sounds. F4 state awareness.

### Key Architectural Decisions

- **Weaver server as orchestrator**: The client sends audio chunks to the Weaver server API, which proxies to whisper-server (port 8178) and Ollama. This avoids CORS issues and centralizes error handling.
- **Whisper-server as child process of Weaver server**: The server spawns/kills the whisper-server binary. The Electron main process passes the binary path via `WEAVER_WHISPER_BIN` env var.
- **AudioWorklet over ScriptProcessorNode**: Runs audio processing on a dedicated thread, avoiding UI jank. Manual AudioContext suspend/resume to prevent system sleep.
- **F4 routes through IPC**: Main process registers F4, sends IPC to renderer to start/stop capture. Renderer runs the pipeline and sends results back via IPC. Main process handles clipboard and native notifications.
- **Model download via server**: Server downloads whisper model files from Hugging Face to `~/.weaver/models/`, streaming progress to the client via SSE.

### Development Workflow

**Assessed complexity: Complex.** This feature spans all packages, introduces new external dependencies (whisper.cpp, Ollama, AudioWorklet), has complex state management (dictation state machine, whisper-server lifecycle), and requires new algorithmic logic (snippet matching, audio chunking).

**Levels: ATDD + BDD + TDD (Levels 1 + 2 + 3).**

- ATDD: Acceptance criteria defined below cover all user-observable behavior.
- BDD: Given-When-Then scenarios for each major flow.
- TDD: Red-Green-Refactor for complex logic units (snippet matching, whisper lifecycle, audio chunking, config validation).

Steps are organized so that test-writing and implementation are separated for non-trivial features. Each step states which workflow level it belongs to.

## BRANCH STRATEGY

Work is organized into 6 git branches under the `voice-to-text/` prefix. Each branch is a reviewable PR. The final step of each branch generates a PR description.

| # | Branch | Steps | Delivers | Depends on |
|---|--------|-------|----------|------------|
| 1 | `voice-to-text/foundation` | 1, 2, PR | Shared types, paths, config validation | none |
| 2 | `voice-to-text/snippets` | 3, 4, 5, 16, PR | Full snippets: storage, API, matching, UI | Branch 1 |
| 3 | `voice-to-text/dictation-services` | 6, 7, 8, 9, 10, PR | All dictation backend services and API routes | Branch 1 |
| 4 | `voice-to-text/build-and-desktop` | 11, 12, PR | Build script, electron-builder, F4 shortcut, IPC | Branch 3 |
| 5 | `voice-to-text/dictation-ui` | 13, 14, 15, 17, 20, PR | Audio capture, dictation page, model download UI, sounds | Branches 3, 4 |
| 6 | `voice-to-text/integration` | 18, 19, 21, PR | Settings, sidebar/routing/palette, F4 IPC wiring | Branch 5 |

**Merge order**: `1 → 2 + 3 (parallel) → 4 → 5 → 6`

Branches 2 and 3 can be reviewed in parallel since they both only depend on Branch 1.



---

# YOUR TASK — Step 21 (do ONLY this step, then stop)

### Step 21: Client: F4 IPC Integration

**Workflow level**: BDD

**Description**: Wire up the F4 headless dictation flow in the renderer. The renderer listens for IPC commands from the main process, runs the dictation pipeline, and sends results back.

**Depends on**: Steps 12 (Electron IPC), 13 (useAudioCapture), 14 (useDictation), 20 (sounds)

**Files to create**:
- `client/src/hooks/useF4Dictation/useF4Dictation.ts`: Hook that listens for F4 IPC commands and orchestrates the headless flow
- `client/src/hooks/useF4Dictation/useF4Dictation.test.ts`: Tests with mocked IPC
- `client/src/hooks/useF4Dictation/index.ts`: Barrel export

**Files to modify**:
- `client/src/App.tsx`: Mount `useF4Dictation` hook at the app level (runs regardless of current page)

**Hook behavior**:
1. Listen for `dictation-command: start` IPC event
2. Play `dictation-start` sound
3. Start audio capture, send chunks to `/api/dictation/transcribe`
4. On `dictation-command: stop` IPC event: play `dictation-stop` sound, stop capture, send to `/api/dictation/process`
5. On result: send `dictation-complete` IPC with processed text, play `dictation-done` sound
6. On error: send `dictation-error` IPC with error message

**Exposes state** (for Dictation page F4 awareness):
- `f4Active: boolean` via a React context or shared state

**BDD scenarios**:
- Given F4 start command received, when audio capture begins, then start sound plays
- Given F4 stop command received, when processing completes, then done sound plays and text is sent to main process
- Given error during F4 flow, when error occurs, then error is sent to main process
- Given F4 is active, when Dictation page checks, then f4Active is true

**Acceptance criteria**:
- F4 IPC commands trigger the correct pipeline steps
- Sounds play at correct moments
- Results are sent back to main process via IPC
- Errors are handled and reported
- f4Active state is accessible to Dictation page
- All tests pass

---

