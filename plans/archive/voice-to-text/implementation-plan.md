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


## IMPLEMENTATION STEPS

---

## Branch 1: `voice-to-text/foundation`

> Base branch: `main`
> Delivers: Shared types, paths, and config validation for the dictation feature.

### Step 1: Shared Types and Paths

**Workflow level**: Foundation (no tests: type-only changes verified by compiler)

**Description**: Add all new types, interfaces, and path helpers needed by the feature.

**Files to modify/create**:
- `shared/types/config.ts`: Add `DictationConfig` interface and `dictation` field to `WeaverConfig` with defaults
- `shared/types/dictation.ts`: Add `Snippet`, `DictationLogEntry`, `WhisperModel` types
- `shared/types/index.ts`: Re-export new types
- `shared/paths/paths.ts`: Add `snippetsPath()`, `dictationsPath()`, `modelsDir()` helpers

**Specific changes**:

`DictationConfig` interface:
```typescript
interface DictationConfig {
  ollama_url: string;      // default: "http://localhost:11434"
  ollama_model: string;    // default: "phi4-mini"
}
```

`Snippet` type:
```typescript
interface Snippet {
  id: string;
  trigger: string;
  expansion: string;
}
```

`DictationLogEntry` type:
```typescript
interface DictationLogEntry {
  timestamp: string;
  rawTranscript: string;
  processedText: string;
}
```

`WhisperModel` type:
```typescript
interface WhisperModel {
  name: string;
  size: string;
  url: string;
  filename: string;
}
```

Add `dictation` to `WeaverConfig` with default:
```typescript
dictation: {
  ollama_url: "http://localhost:11434",
  ollama_model: "phi4-mini",
}
```

New paths:
```typescript
export const snippetsPath = () => join(weaverDir(), "snippets.jsonl");
export const dictationsPath = () => join(weaverDir(), "dictations.jsonl");
export const modelsDir = () => join(weaverDir(), "models");
```

**Acceptance criteria**:
- `DictationConfig`, `Snippet`, `DictationLogEntry`, `WhisperModel` types are exported from `@weaver/shared/types`
- `WeaverConfig` includes `dictation: DictationConfig` with defaults in `DEFAULT_CONFIG`
- `snippetsPath()`, `dictationsPath()`, `modelsDir()` are exported from `@weaver/shared/paths`
- `npm run build` passes across all packages (no type errors)

---

### Step 2: Config Validation for Dictation Fields

**Workflow level**: TDD (Red-Green-Refactor)

**Description**: Add field validators for the new `dictation` config section, following the existing `FIELD_VALIDATORS` pattern in `server/src/services/config/validators/field.ts`.

**Depends on**: Step 1 (shared types)

**Files to modify/create**:
- `server/src/services/config/validators/field.ts`: Add `validateDictation` validator and register it in `FIELD_VALIDATORS`
- `server/src/services/config/validators/field.test.ts`: Add tests for the new validator

**Validation rules**:
- `dictation` must be an object
- `dictation.ollama_url` must be a non-empty string
- `dictation.ollama_model` must be a non-empty string
- Unknown keys within `dictation` are ignored (forward-compatible)
- Missing keys fall back to defaults

**Acceptance criteria**:
- Valid dictation config passes validation without warnings
- Invalid types produce descriptive warning strings
- Missing `dictation` key falls back to `DEFAULT_CONFIG.dictation`
- Partial dictation objects merge with defaults
- All new tests pass, existing config tests still pass

---

### Step 2.1: Generate PR Description for `voice-to-text/foundation`

**Description**: Generate a PR description summarizing the changes in this branch. Write it to `pr-description.md` in the repo root (do not commit this file).

**PR description must include**:
- Title: `feat: add shared types, paths, and config validation for voice-to-text`
- Summary of what was added and why
- List of files changed
- Testing: what tests were added, how to verify
- Checklist: `npm run build` passes, `npm test` passes, no breaking changes to existing config

---

## Branch 2: `voice-to-text/snippets`

> Base branch: `voice-to-text/foundation`
> Delivers: Complete snippets feature: backend storage, API routes, matching algorithm, and UI page.

### Step 3: Snippets Storage Service

**Workflow level**: TDD (Red-Green-Refactor)

**Description**: Create a service for reading, writing, and deleting snippets from `~/.weaver/snippets.jsonl`. Follow the existing storage patterns (e.g., `server/src/services/storage/sessions.ts`).

**Depends on**: Step 1 (shared types and paths)

**Files to create**:
- `server/src/services/snippets/snippets.ts`: `readSnippets()`, `writeSnippet(snippet)`, `updateSnippet(id, snippet)`, `deleteSnippet(id)` functions
- `server/src/services/snippets/snippets.test.ts`: Tests for all CRUD operations
- `server/src/services/snippets/index.ts`: Barrel export

**Implementation notes**:
- Use `atomicWriteFile` for writes (existing pattern in `server/src/utils/atomic-write.ts`)
- Generate snippet IDs with `crypto.randomUUID()`
- `readSnippets` returns `Snippet[]`, handles missing file gracefully (returns `[]`)
- `writeSnippet` appends to the file
- `updateSnippet` reads all, replaces matching ID, rewrites file
- `deleteSnippet` reads all, filters out matching ID, rewrites file

**Acceptance criteria**:
- `readSnippets()` returns `[]` when file doesn't exist
- `writeSnippet()` creates file if missing and appends the snippet
- `updateSnippet()` replaces the correct snippet by ID
- `deleteSnippet()` removes the correct snippet by ID
- All operations use atomic writes
- All tests pass

---

### Step 4: Snippets API Routes

**Workflow level**: BDD (Given-When-Then scenarios)

**Description**: Create Fastify routes for snippets CRUD. Follow the existing route patterns (e.g., `server/src/routes/orphans/orphans.ts`).

**Depends on**: Step 3 (snippets storage service)

**Files to create**:
- `server/src/routes/snippets/snippets.ts`: Route handlers for GET/POST/PUT/DELETE `/api/snippets`
- `server/src/routes/snippets/snippets.test.ts`: Route tests
- `server/src/routes/snippets/index.ts`: Barrel export

**File to modify**:
- `server/src/index.ts`: Register snippet routes

**Routes**:
- `GET /api/snippets` → returns `{ snippets: Snippet[] }`
- `POST /api/snippets` → body: `{ trigger, expansion }` → returns `{ snippet: Snippet }` (201)
- `PUT /api/snippets/:id` → body: `{ trigger, expansion }` → returns `{ snippet: Snippet }`
- `DELETE /api/snippets/:id` → returns 204

**BDD scenarios**:
- Given no snippets exist, when GET /api/snippets, then return empty array
- Given snippets exist, when GET /api/snippets, then return all snippets
- Given valid body, when POST /api/snippets, then create snippet and return 201
- Given missing trigger, when POST /api/snippets, then return 400
- Given valid body and existing ID, when PUT /api/snippets/:id, then update and return snippet
- Given non-existent ID, when PUT /api/snippets/:id, then return 404
- Given existing ID, when DELETE /api/snippets/:id, then return 204
- Given non-existent ID, when DELETE /api/snippets/:id, then return 404

**Acceptance criteria**:
- All four CRUD operations work correctly
- Input validation returns 400 for missing required fields
- 404 returned for operations on non-existent snippet IDs
- All tests pass

---

### Step 5: Snippet Matching Logic

**Workflow level**: TDD (Red-Green-Refactor)

**Description**: Implement the snippet matching algorithm. This is a pure function with specific rules that warrant unit-level TDD.

**Depends on**: Step 1 (shared types)

**Files to create**:
- `server/src/services/dictation/snippet-matcher.ts`: `matchSnippet(transcript: string, snippets: Snippet[]): Snippet | null`
- `server/src/services/dictation/snippet-matcher.test.ts`: Comprehensive tests

**Algorithm**:
1. Normalize input: filter to alphabetic characters only, lowercase
2. For each snippet, normalize the trigger the same way
3. Check if normalized transcript exactly equals normalized trigger
4. If exactly one snippet matches, return it
5. If zero or multiple snippets match, return `null`

**TDD test cases**:
- Exact match (case-insensitive): `"Insert Intro"` matches trigger `"insert intro"` → returns snippet
- Non-alpha characters ignored: `"insert, intro!"` matches trigger `"insert intro"` → returns snippet
- No match: `"hello world"` with trigger `"insert intro"` → returns `null`
- Substring does NOT match: `"please insert intro now"` with trigger `"insert intro"` → returns `null`
- Multiple matches: transcript matches two different triggers → returns `null`
- Empty transcript → returns `null`
- Empty snippets array → returns `null`

**Acceptance criteria**:
- All matching rules implemented correctly per the algorithm above
- All test cases pass
- Function is pure (no side effects)

---

### Step 16: Client: Snippets Page

**Workflow level**: BDD (component behavior scenarios)

**Description**: Create the Snippets management page with add/edit/delete functionality.

**Depends on**: Step 4 (snippets API routes)

**Files to create**:
- `client/src/pages/SnippetsPage/SnippetsPage.tsx`: Thin orchestrator
- `client/src/pages/SnippetsPage/types.ts`: Prop interfaces
- `client/src/pages/SnippetsPage/hooks/useSnippetsPage.ts`: Page hook (fetch, create, update, delete)
- `client/src/pages/SnippetsPage/hooks/useSnippetsPage.test.ts`: Hook tests
- `client/src/pages/SnippetsPage/components/SnippetCard.tsx`: Card displaying trigger + expansion with edit/delete actions
- `client/src/pages/SnippetsPage/components/SnippetForm.tsx`: Inline form for adding/editing a snippet (trigger input + multi-line expansion textarea)
- `client/src/pages/SnippetsPage/SnippetsPage.test.tsx`: Component tests
- `client/src/pages/SnippetsPage/index.ts`: Barrel export

**UI layout**:
- Header: "Snippets" with "Add Snippet" button
- Info text: "Snippets are triggered when your entire dictation matches the trigger phrase exactly. Choose unique phrases that won't appear in regular speech."
- List of SnippetCards, each showing trigger (bold) and expansion (multi-line, truncated with expand)
- Each card has Edit and Delete action buttons
- SnippetForm appears inline when adding or editing (replaces the card or appears at top)

**BDD scenarios**:
- Given no snippets exist, when page loads, then show empty state message
- Given snippets exist, when page loads, then show all snippet cards
- Given user clicks Add, when form appears, then user can enter trigger and expansion and save
- Given user clicks Edit on a card, when form appears, then it's pre-populated with existing values
- Given user clicks Delete, when confirmation is shown, then snippet is removed
- Given user saves with empty trigger, when validation runs, then show error

**Acceptance criteria**:
- All CRUD operations work end-to-end via the API
- Form validation prevents empty triggers
- Multi-line expansions display correctly
- Guidance text is visible
- All tests pass

---

### Step 16.1: Generate PR Description for `voice-to-text/snippets`

**Description**: Generate a PR description summarizing the changes in this branch. Write it to `pr-description.md` in the repo root (do not commit this file).

**PR description must include**:
- Title: `feat: add snippets system with storage, API, matching, and UI`
- Summary of what was added: snippets CRUD (storage + API), matching algorithm, Snippets page
- List of files changed
- API endpoints added (with request/response shapes)
- Testing: what tests were added, how to verify
- Screenshots/description of the Snippets page UI


---

## Branch 3: `voice-to-text/dictation-services`

> Base branch: `voice-to-text/foundation`
> Delivers: All dictation backend services (whisper lifecycle, Ollama client, history, model download) and API routes.

### Step 6: Whisper Server Lifecycle Service

**Workflow level**: TDD (Red-Green-Refactor)

**Description**: Create a service that manages the whisper-server child process: spawn, health check, kill, and inactivity timeout.

**Depends on**: Step 1 (shared types)

**Files to create**:
- `server/src/services/dictation/whisper-server.ts`: `startWhisperServer(binPath, modelPath)`, `stopWhisperServer()`, `isWhisperServerRunning()`, `touchWhisperActivity()` (resets inactivity timer)
- `server/src/services/dictation/whisper-server.test.ts`: Tests with mocked child_process
- `server/src/services/dictation/index.ts`: Barrel export

**Implementation notes**:
- Use `spawn()` from `child_process` to launch the binary
- Binary path comes from `WEAVER_WHISPER_BIN` env var or falls back to a default dev path
- Model path comes from `~/.weaver/models/<model-filename>`
- Health check: HTTP GET to `http://localhost:8178/health` (or equivalent whisper-server endpoint)
- Inactivity timeout: 5 minutes. Reset on every transcription request. On timeout, kill the process.
- Log lifecycle events using the existing `log()` pattern
- Expose `WHISPER_PORT = 8178` as a constant

**Acceptance criteria**:
- `startWhisperServer()` spawns the binary with correct args (model path, port, host)
- `stopWhisperServer()` sends SIGTERM, then SIGKILL after 2 seconds (same pattern as `server.ts` stop)
- `isWhisperServerRunning()` returns true when process is alive and health check passes
- Inactivity timer kills the process after 5 minutes of no `touchWhisperActivity()` calls
- Double-start is a no-op (doesn't spawn a second process)
- All tests pass with mocked child_process and HTTP

---

### Step 7: Ollama Client Service

**Workflow level**: TDD (Red-Green-Refactor)

**Description**: Create a thin client for Ollama's REST API: health check and text generation.

**Depends on**: Step 1 (shared types)

**Files to create**:
- `server/src/services/dictation/ollama-client.ts`: `checkOllamaHealth(url)`, `generateText(url, model, prompt)` functions
- `server/src/services/dictation/ollama-client.test.ts`: Tests with mocked fetch

**Implementation notes**:
- `checkOllamaHealth(url)`: GET `{url}/api/tags`, returns `true` if 200, `false` otherwise
- `generateText(url, model, prompt)`: POST `{url}/api/generate` with `{ model, prompt, stream: false }`, returns the `response` field from the JSON body
- The prompt for cleanup will be: `"Clean up the following transcript. Fix grammar, add punctuation, remove filler words (um, uh, like, you know). Do not change the meaning or add new content. Return only the cleaned text, nothing else.\n\nTranscript:\n{transcript}"`
- Handle errors gracefully: return descriptive error messages

**Acceptance criteria**:
- `checkOllamaHealth` returns `true` for 200 response, `false` for errors
- `generateText` sends correct request body and extracts response text
- Network errors are caught and returned as descriptive error strings
- All tests pass

---

### Step 8: Dictation History Service

**Workflow level**: Simple (ATDD only: straightforward append-to-file)

**Description**: Create a service for logging dictation entries to `~/.weaver/dictations.jsonl`.

**Depends on**: Step 1 (shared types and paths)

**Files to create**:
- `server/src/services/dictation/history.ts`: `logDictation(entry: DictationLogEntry)` function
- `server/src/services/dictation/history.test.ts`: Tests

**Implementation notes**:
- Append JSON line to `dictationsPath()`
- Create file if it doesn't exist
- Use `appendFile` (not atomic write: append-only is safe)

**Acceptance criteria**:
- `logDictation()` appends a JSON line to the file
- File is created if it doesn't exist
- Multiple calls append multiple lines
- Tests pass

---

### Step 9: Model Download Service

**Workflow level**: BDD (Given-When-Then)

**Description**: Create a service that downloads whisper model files from Hugging Face to `~/.weaver/models/` with progress tracking.

**Depends on**: Step 1 (shared types and paths)

**Files to create**:
- `server/src/services/dictation/model-download.ts`: `downloadModel(model: WhisperModel, onProgress: (percent: number) => void)`, `listLocalModels()`, `getDefaultModelPath()`
- `server/src/services/dictation/model-download.test.ts`: Tests with mocked HTTP

**Available models** (hardcoded list):
```typescript
const AVAILABLE_MODELS: WhisperModel[] = [
  { name: "Tiny (English)", size: "75 MB", filename: "ggml-tiny.en.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin" },
  { name: "Base (English)", size: "142 MB", filename: "ggml-base.en.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" },
  { name: "Small (English)", size: "466 MB", filename: "ggml-small.en.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin" },
];
```

**BDD scenarios**:
- Given no models directory exists, when `downloadModel` is called, then create the directory and download the file
- Given a model is downloading, when progress updates arrive, then call `onProgress` with percentage
- Given download completes, when `listLocalModels` is called, then the downloaded model appears in the list
- Given a model already exists locally, when `downloadModel` is called for the same model, then skip download and return immediately
- Given network error during download, when download fails, then clean up partial file and throw descriptive error

**Acceptance criteria**:
- Models download to `~/.weaver/models/<filename>`
- Progress callback fires with percentage (0-100)
- Partial downloads are cleaned up on failure
- `listLocalModels()` returns filenames of models present in the directory
- `getDefaultModelPath()` returns path to first available model, or `null` if none
- All tests pass

---

### Step 10: Dictation API Routes

**Workflow level**: BDD (Given-When-Then)

**Description**: Create Fastify routes for dictation operations: transcribe audio, process transcript, check service status, download models.

**Depends on**: Steps 5, 6, 7, 8, 9 (all dictation services). Note: Step 5 (snippet-matcher) is in Branch 2 but the file is in `server/src/services/dictation/`. If Branch 2 hasn't merged yet, create a minimal inline snippet matching call or import conditionally. The snippet-matcher module will exist on disk from Branch 2.

**Files to create**:
- `server/src/routes/dictation/dictation.ts`: Route handlers
- `server/src/routes/dictation/dictation.test.ts`: Route tests
- `server/src/routes/dictation/index.ts`: Barrel export

**File to modify**:
- `server/src/index.ts`: Register dictation routes, pass whisper binary path from env

**Routes**:
- `GET /api/dictation/status` → returns `{ whisper: boolean, ollama: boolean, model: string | null }` (pre-flight check)
- `POST /api/dictation/transcribe` → body: WAV audio buffer (multipart) → returns `{ text: string }` (proxies to whisper-server)
- `POST /api/dictation/process` → body: `{ transcript: string, snippets: Snippet[] }` → returns `{ processedText: string, snippetUsed: string | null }` (runs snippet matching, then Ollama if no snippet)
- `GET /api/dictation/models` → returns `{ available: WhisperModel[], local: string[] }`
- `POST /api/dictation/models/download` → body: `{ filename: string }` → SSE stream of `{ progress: number }` events, then `{ complete: true }`

**BDD scenarios**:
- Given whisper-server and Ollama are running, when GET /api/dictation/status, then return both true
- Given whisper-server is down, when GET /api/dictation/status, then return whisper: false
- Given valid audio, when POST /api/dictation/transcribe, then start whisper-server if needed, proxy audio, return text
- Given transcript matching a snippet, when POST /api/dictation/process, then return snippet expansion
- Given transcript not matching any snippet, when POST /api/dictation/process, then return Ollama-cleaned text
- Given model not downloaded, when POST /api/dictation/models/download, then stream progress and download

**Acceptance criteria**:
- Status endpoint correctly reports health of both services
- Transcribe endpoint starts whisper-server on demand and proxies audio
- Process endpoint applies snippet matching before Ollama
- Process endpoint logs dictation to history
- Model download streams progress via SSE
- All tests pass

---

### Step 10.1: Generate PR Description for `voice-to-text/dictation-services`

**Description**: Generate a PR description summarizing the changes in this branch. Write it to `pr-description.md` in the repo root (do not commit this file).

**PR description must include**:
- Title: `feat: add dictation backend services and API routes`
- Summary: whisper-server lifecycle, Ollama client, dictation history, model download, API routes
- List of files changed
- API endpoints added (with request/response shapes)
- Architecture notes: how whisper-server is managed, how Ollama is called
- Testing: what tests were added, how to verify


---

## Branch 4: `voice-to-text/build-and-desktop`

> Base branch: `voice-to-text/dictation-services`
> Delivers: whisper-server build script, electron-builder config, F4 global shortcut, IPC bridge, preload extensions.

### Step 11: Build Script for whisper-server Binary

**Workflow level**: ATDD (acceptance test: binary exists after build)

**Description**: Create a build script that compiles whisper.cpp's server binary for arm64 macOS and integrates it into `npm run dist`.

**Depends on**: None (independent infrastructure step)

**Files to create**:
- `scripts/build-whisper.sh`: Shell script that clones whisper.cpp, builds whisper-server for arm64, copies binary to `desktop/resources/whisper-server`

**Files to modify**:
- `package.json` (root): Add `"build:whisper": "bash scripts/build-whisper.sh"`, update `dist` script to include `build:whisper`
- `desktop/package.json`: Add `whisper-server` to `extraResources` in electron-builder config

**Script behavior**:
1. Check if `desktop/resources/whisper-server` already exists and is up-to-date (skip if so)
2. Clone whisper.cpp to a temp directory (or use existing clone)
3. Build with CMake: `cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --target whisper-server -j`
4. Copy `build/bin/whisper-server` to `desktop/resources/whisper-server`
5. Clean up temp directory

**electron-builder extraResources addition**:
```json
{
  "from": "resources/whisper-server",
  "to": "whisper-server"
}
```

**Acceptance criteria**:
- `npm run build:whisper` produces `desktop/resources/whisper-server` binary
- Binary is arm64 macOS (verify with `file` command)
- `npm run dist` includes the binary in the packaged app
- Script is idempotent (re-running doesn't fail)

---

### Step 12: Electron Main Process: Whisper Binary Path and F4 Shortcut

**Workflow level**: ATDD

**Description**: Update the Electron main process to pass the whisper binary path to the server, register the F4 global shortcut, and add IPC handlers for dictation.

**Depends on**: Step 11 (build script produces binary)

**Files to modify**:
- `desktop/src/main.ts`: Add F4 shortcut registration, pass `WEAVER_WHISPER_BIN` env var to server, add dictation state tracking
- `desktop/src/server.ts`: Add `WEAVER_WHISPER_BIN` to the env passed to the forked server process
- `desktop/src/preload.ts`: Add new IPC bridge methods for dictation

**Files to create**:
- `desktop/src/dictation.ts`: Dictation state machine for F4 flow (idle → recording → processing → done), IPC handlers, native notifications, clipboard

**New preload bridge methods** (add to `contextBridge.exposeInMainWorld`):
```typescript
startDictation: () => ipcRenderer.invoke("dictation-start"),
stopDictation: () => ipcRenderer.invoke("dictation-stop"),
onDictationCommand: (callback) => ipcRenderer.on("dictation-command", callback),
copyToClipboard: (text: string) => ipcRenderer.send("copy-clipboard", text),
showNotification: (title: string, body: string) => ipcRenderer.send("show-notification", title, body),
```

**F4 flow in `dictation.ts`**:
1. F4 pressed, state is `idle` → set state to `recording`, send IPC `dictation-command: start` to renderer, show native notification "Listening...", play start sound via IPC
2. F4 pressed, state is `recording` → set state to `processing`, send IPC `dictation-command: stop` to renderer, show notification "Processing..."
3. Renderer sends `dictation-complete` with text → copy to clipboard, show notification "Copied to clipboard!", play done sound via IPC, set state to `idle`
4. Renderer sends `dictation-error` with message → show notification with error, set state to `idle`

**Acceptance criteria**:
- F4 shortcut is registered alongside F5
- `WEAVER_WHISPER_BIN` env var is set correctly for both packaged and dev modes
- Preload bridge exposes new dictation methods
- `WeaverBridge` type in `client/src/types/weaver-bridge.d.ts` is updated to match
- F4 toggles between recording and processing states
- Native macOS notifications appear at each stage

---

### Step 12.1: Generate PR Description for `voice-to-text/build-and-desktop`

**Description**: Generate a PR description summarizing the changes in this branch. Write it to `pr-description.md` in the repo root (do not commit this file).

**PR description must include**:
- Title: `feat: add whisper-server build script, F4 shortcut, and IPC bridge`
- Summary: build script, electron-builder changes, F4 state machine, preload bridge, native notifications
- List of files changed
- How to test: `npm run build:whisper`, verify binary, test F4 in dev mode
- Notes on the F4 state machine and IPC flow

---

## Branch 5: `voice-to-text/dictation-ui`

> Base branch: `voice-to-text/build-and-desktop`
> Delivers: Audio capture infrastructure, dictation orchestration hook, Dictation page with all components, model download UI, and dictation sounds.

### Step 13: Client: AudioWorklet and useAudioCapture Hook

**Workflow level**: TDD for the hook logic, ATDD for AudioWorklet (browser API, tested via integration)

**Description**: Create the AudioWorklet processor and a React hook that manages audio capture, chunking, and WAV encoding.

**Depends on**: Step 12 (preload bridge for IPC)

**Files to create**:
- `client/public/audio-processor.js`: AudioWorklet processor that buffers samples and posts chunks via `postMessage`
- `client/src/hooks/useAudioCapture/useAudioCapture.ts`: Hook that manages AudioContext lifecycle, starts/stops recording, collects audio chunks, encodes to WAV
- `client/src/hooks/useAudioCapture/wav-encoder.ts`: Pure function to encode Float32Array PCM samples to WAV Blob (16kHz, 16-bit, mono)
- `client/src/hooks/useAudioCapture/wav-encoder.test.ts`: Tests for WAV encoder
- `client/src/hooks/useAudioCapture/index.ts`: Barrel export

**AudioWorklet processor** (`audio-processor.js`):
- Buffer size: 2048 samples (~128ms at 16kHz)
- Accumulate samples until chunk duration reached (~4 seconds)
- Post chunk to main thread via `postMessage`

**useAudioCapture hook** returns:
```typescript
{
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  onChunk: (callback: (wavBlob: Blob) => void) => void;
}
```

**Implementation notes**:
- Request microphone via `navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })`
- Create AudioContext, connect MediaStreamSource → AudioWorklet
- Resample to 16kHz if device sample rate differs
- On stop: flush remaining buffer as final chunk
- Suspend AudioContext when not recording (prevent system sleep in Electron)

**WAV encoder** (pure function, TDD target):
- Input: Float32Array of PCM samples at 16kHz
- Output: Blob with WAV header (44 bytes) + 16-bit PCM data
- Follow the same WAV encoding pattern as `client/src/hooks/notifications/soundUtils.ts`

**Acceptance criteria**:
- WAV encoder produces valid WAV files (correct header, sample rate, bit depth)
- Hook requests microphone permission and starts recording
- Audio chunks are emitted at ~4 second intervals
- Final chunk is flushed on stop
- AudioContext is suspended when not recording
- WAV encoder tests pass

---

### Step 14: Client: useDictation Hook

**Workflow level**: BDD (Given-When-Then scenarios for the orchestration logic)

**Description**: Create the main dictation orchestration hook that ties together audio capture, transcription, LLM processing, and snippet matching.

**Depends on**: Steps 10 (dictation API routes), 13 (useAudioCapture hook)

**Files to create**:
- `client/src/hooks/useDictation/useDictation.ts`: Main orchestration hook
- `client/src/hooks/useDictation/useDictation.test.ts`: Tests with mocked API and audio
- `client/src/hooks/useDictation/types.ts`: State and action interfaces
- `client/src/hooks/useDictation/index.ts`: Barrel export

**Hook state machine**:
```
idle → preflight_checking → ready → recording → processing → done
                         ↘ error (service unavailable)
```

**Hook returns**:
```typescript
{
  state: {
    phase: "idle" | "preflight_checking" | "ready" | "recording" | "processing" | "done" | "error";
    rawTranscript: string;
    processedText: string;
    error: string | null;
    whisperStatus: boolean;
    ollamaStatus: boolean;
    f4Active: boolean;
  };
  actions: {
    checkServices: () => Promise<void>;
    startDictation: () => void;
    stopDictation: () => void;
    copyToClipboard: () => void;
    reset: () => void;
  };
}
```

**Orchestration flow**:
1. `checkServices()`: GET `/api/dictation/status`, update whisperStatus/ollamaStatus, transition to `ready` or `error`
2. `startDictation()`: Start audio capture, transition to `recording`
3. On each audio chunk: POST `/api/dictation/transcribe`, append result to `rawTranscript`
4. `stopDictation()`: Stop audio capture, flush final chunk, POST `/api/dictation/process` with full transcript, transition to `processing`
5. On process complete: set `processedText`, transition to `done`
6. `copyToClipboard()`: Copy `processedText` to clipboard
7. F4 awareness: listen for `dictation-command` IPC events, set `f4Active` flag

**BDD scenarios**:
- Given services are healthy, when checkServices is called, then phase transitions to ready
- Given whisper is down, when checkServices is called, then phase transitions to error with descriptive message
- Given phase is ready, when startDictation is called, then phase transitions to recording and audio capture begins
- Given phase is recording and chunks arrive, when transcription succeeds, then rawTranscript accumulates
- Given phase is recording, when stopDictation is called, then phase transitions to processing and LLM is invoked
- Given processing completes, when result arrives, then phase transitions to done with processedText populated
- Given F4 is active, when f4Active is checked, then it returns true

**Acceptance criteria**:
- State machine transitions are correct for all paths
- Raw transcript accumulates across chunks
- Snippet matching is applied before LLM processing
- Errors are captured and surfaced in state
- F4 IPC events are handled
- All tests pass

---

### Step 15: Client: Dictation Page Components

**Workflow level**: BDD (component behavior scenarios)

**Description**: Create the Dictation page with pre-flight checks, transcript display, controls, and F4 awareness. Follow the component decomposition pattern.

**Depends on**: Step 14 (useDictation hook)

**Files to create**:
- `client/src/pages/DictationPage/DictationPage.tsx`: Thin orchestrator
- `client/src/pages/DictationPage/types.ts`: Prop interfaces
- `client/src/pages/DictationPage/hooks/useDictationPage.ts`: Page-level hook (wraps useDictation + page-specific state)
- `client/src/pages/DictationPage/components/PreflightCheck.tsx`: Status indicators for whisper and Ollama
- `client/src/pages/DictationPage/components/TranscriptPanel.tsx`: Two stacked text areas (raw + processed)
- `client/src/pages/DictationPage/components/DictationControls.tsx`: Start/Stop/Copy buttons + link to Snippets
- `client/src/pages/DictationPage/DictationPage.test.tsx`: Component tests
- `client/src/pages/DictationPage/index.ts`: Barrel export

**UI layout**:
- Header: "Dictation"
- Alert (info): shown when F4 is active: "Dictation in progress via F4 shortcut. Controls are disabled."
- PreflightCheck: green/red status for whisper-server and Ollama
- DictationControls: Start Dictation / Stop Dictation button (disabled when services down or F4 active), Copy to Clipboard button, "Manage Snippets" link
- TranscriptPanel: two Cloudscape Textarea components, vertically stacked. Top: "Raw Transcript" (read-only, live updating). Bottom: "Processed Output" (read-only, populated after processing). "Processing..." spinner between chunks.

**BDD scenarios**:
- Given services are healthy, when page loads, then Start button is enabled and status indicators are green
- Given whisper is down, when page loads, then Start button is disabled and whisper indicator is red with error Alert
- Given user clicks Start, when recording begins, then raw transcript area updates with chunks and Stop button appears
- Given user clicks Stop, when processing begins, then "Processing..." indicator shows and processed output appears when done
- Given F4 is active, when page is visible, then all controls are disabled and info Alert is shown
- Given processed text exists, when user clicks Copy, then text is copied to clipboard

**Acceptance criteria**:
- Page renders with pre-flight checks on mount
- Controls are correctly enabled/disabled based on state
- Raw transcript updates live during recording
- Processed output appears after stop + processing
- F4 active state disables controls and shows Alert
- Copy button works
- All tests pass

---

### Step 17: Client: Model Download UI

**Workflow level**: BDD

**Description**: Create a model download component shown on the Dictation page when no whisper model is available locally.

**Depends on**: Steps 9 (model download service), 10 (dictation API routes)

**Files to create**:
- `client/src/pages/DictationPage/components/ModelDownload.tsx`: Model selection and download UI with progress bar
- `client/src/pages/DictationPage/components/ModelDownload.test.tsx`: Component tests

**UI layout**:
- Shown instead of the dictation controls when no model is available
- Header: "Download Speech Recognition Model"
- Description: "A speech recognition model is required for dictation. Select a model to download."
- Table/list of available models with name, size, and "Download" button
- During download: progress bar with percentage
- After download: success message, then auto-transition to normal dictation view

**BDD scenarios**:
- Given no model exists locally, when Dictation page loads, then ModelDownload is shown instead of controls
- Given user clicks Download on a model, when download starts, then progress bar appears
- Given download completes, when model is available, then dictation controls appear
- Given download fails, when error occurs, then error Alert is shown with retry option

**Acceptance criteria**:
- Component fetches available/local models from GET /api/dictation/models
- Download triggers POST /api/dictation/models/download and shows progress
- After successful download, dictation page transitions to normal view
- Error states are handled gracefully
- All tests pass

---

### Step 20: Client: Dictation Sounds

**Workflow level**: Simple (ATDD)

**Description**: Add three new notification sounds for the dictation flow: start, stop, and done.

**Depends on**: None (independent, follows existing `soundUtils.ts` pattern)

**Files to modify**:
- `client/src/hooks/notifications/soundUtils.ts`: Add `"dictation-start"`, `"dictation-stop"`, `"dictation-done"` sound types and their generated tones

**Sound design**:
- `dictation-start`: Single rising tone (e.g., 440Hz → 660Hz, 0.15s) to indicate recording started
- `dictation-stop`: Single falling tone (e.g., 660Hz → 440Hz, 0.15s) to indicate recording stopped
- `dictation-done`: Two-note ascending chime (e.g., 523Hz + 784Hz, similar to existing `chime` but distinct) to indicate clipboard copy

**Acceptance criteria**:
- Three new sound types are exported and playable via `playNotificationSound()`
- Sounds are distinct from each other and from existing sounds
- No changes to existing sound behavior

---

### Step 20.1: Generate PR Description for `voice-to-text/dictation-ui`

**Description**: Generate a PR description summarizing the changes in this branch. Write it to `pr-description.md` in the repo root (do not commit this file).

**PR description must include**:
- Title: `feat: add Dictation page with audio capture, model download, and sounds`
- Summary: AudioWorklet, useAudioCapture, useDictation, DictationPage, ModelDownload, dictation sounds
- List of files changed
- Description of the Dictation page UI and user flow
- Description of the model download experience
- Testing: what tests were added, how to verify


---

## Branch 6: `voice-to-text/integration`

> Base branch: `voice-to-text/dictation-ui`
> Delivers: Settings page dictation section, sidebar/routing/command palette wiring, F4 IPC integration. This is the final branch that makes everything accessible.

### Step 18: Client: Settings Page Dictation Section

**Workflow level**: ATDD

**Description**: Add a dictation configuration section to the existing Settings page, gated by `isElectron()`.

**Depends on**: Steps 1 (shared types), 2 (config validation)

**Files to modify**:
- `client/src/pages/SettingsPage/SettingsPage.tsx`: Add dictation config fields inside an `isElectron()` guard
- `client/src/pages/SettingsPage/SettingsPage.test.tsx`: Add tests for new fields

**New fields** (inside `isElectron()` block):
- "Ollama URL" (Input, default `http://localhost:11434`)
- "Ollama Model" (Input with description listing recommended models: phi4-mini, qwen3:1.7b, gemma3:1b with brief pros/cons)
- "Test Connection" button next to Ollama URL that calls GET /api/dictation/status and shows result

**Acceptance criteria**:
- Dictation fields appear only when `isElectron()` is true
- Fields read from and write to `config.dictation.*`
- Test Connection button shows success/failure feedback
- Saving persists dictation config
- Fields hidden in web mode
- All tests pass

---

### Step 19: Client: Sidebar, Command Palette, and Routing

**Workflow level**: ATDD

**Description**: Wire up the Dictation and Snippets pages into the app: routes, sidebar navigation, command palette entries, all gated by `isElectron()`.

**Depends on**: Steps 15 (DictationPage), 16 (SnippetsPage)

**Files to modify**:
- `client/src/App.tsx`: Add routes for `/dictation` and `/snippets`. Add conditional sidebar entries. Import pages.
- `client/src/hooks/useWindowList/useWindowList.ts`: Add Dictation and Snippets to `STATIC_WINDOWS` (conditionally based on `isElectron()`)
- `client/src/types/weaver-bridge.d.ts`: Ensure new preload methods are typed

**Sidebar entries** (added conditionally when `isElectron()` is true):
```typescript
{ type: "link", text: "Dictation", href: "/dictation" },
{ type: "link", text: "Snippets", href: "/snippets" },
```

**Command palette entries** (added conditionally):
```typescript
{ label: "Dictation", href: "/dictation", searchableText: "Dictation voice speech text" },
{ label: "Snippets", href: "/snippets", searchableText: "Snippets triggers expansion" },
```

**Acceptance criteria**:
- `/dictation` route renders DictationPage
- `/snippets` route renders SnippetsPage
- Sidebar shows Dictation and Snippets links only in Electron
- Command palette includes Dictation and Snippets only in Electron
- Web mode: no sidebar links, no command palette entries, navigating to `/dictation` or `/snippets` shows nothing (or redirects)
- All existing tests still pass

---

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

### Step 21.1: Generate PR Description for `voice-to-text/integration`

**Description**: Generate a PR description summarizing the changes in this branch. Write it to `pr-description.md` in the repo root (do not commit this file).

**PR description must include**:
- Title: `feat: wire up dictation settings, routing, and F4 headless flow`
- Summary: Settings page dictation section, sidebar/command palette entries, F4 IPC integration
- List of files changed
- Description of the F4 headless flow end-to-end
- Note that this is the final branch: after merge, the full voice-to-text feature is complete
- Full manual testing checklist for the entire feature


## FILES TO MODIFY/CREATE

### New Files

| File | Branch | Description |
|------|--------|-------------|
| `shared/types/dictation.ts` | 1 | Snippet, DictationLogEntry, WhisperModel types |
| `server/src/services/snippets/snippets.ts` | 2 | Snippets CRUD storage service |
| `server/src/services/snippets/snippets.test.ts` | 2 | Snippets storage tests |
| `server/src/services/snippets/index.ts` | 2 | Barrel export |
| `server/src/routes/snippets/snippets.ts` | 2 | Snippets API routes |
| `server/src/routes/snippets/snippets.test.ts` | 2 | Snippets route tests |
| `server/src/routes/snippets/index.ts` | 2 | Barrel export |
| `server/src/services/dictation/snippet-matcher.ts` | 2 | Snippet matching algorithm |
| `server/src/services/dictation/snippet-matcher.test.ts` | 2 | Snippet matching tests |
| `client/src/pages/SnippetsPage/SnippetsPage.tsx` | 2 | Snippets page orchestrator |
| `client/src/pages/SnippetsPage/types.ts` | 2 | Page types |
| `client/src/pages/SnippetsPage/hooks/useSnippetsPage.ts` | 2 | Page hook |
| `client/src/pages/SnippetsPage/hooks/useSnippetsPage.test.ts` | 2 | Hook tests |
| `client/src/pages/SnippetsPage/components/SnippetCard.tsx` | 2 | Snippet display card |
| `client/src/pages/SnippetsPage/components/SnippetForm.tsx` | 2 | Add/edit form |
| `client/src/pages/SnippetsPage/SnippetsPage.test.tsx` | 2 | Page tests |
| `client/src/pages/SnippetsPage/index.ts` | 2 | Barrel export |
| `server/src/services/dictation/whisper-server.ts` | 3 | Whisper server lifecycle management |
| `server/src/services/dictation/whisper-server.test.ts` | 3 | Whisper server tests |
| `server/src/services/dictation/ollama-client.ts` | 3 | Ollama REST API client |
| `server/src/services/dictation/ollama-client.test.ts` | 3 | Ollama client tests |
| `server/src/services/dictation/history.ts` | 3 | Dictation history logging |
| `server/src/services/dictation/history.test.ts` | 3 | History tests |
| `server/src/services/dictation/model-download.ts` | 3 | Model download with progress |
| `server/src/services/dictation/model-download.test.ts` | 3 | Model download tests |
| `server/src/services/dictation/index.ts` | 3 | Barrel export |
| `server/src/routes/dictation/dictation.ts` | 3 | Dictation API routes |
| `server/src/routes/dictation/dictation.test.ts` | 3 | Dictation route tests |
| `server/src/routes/dictation/index.ts` | 3 | Barrel export |
| `scripts/build-whisper.sh` | 4 | Build script for whisper-server binary |
| `desktop/src/dictation.ts` | 4 | F4 state machine, IPC handlers, notifications |
| `client/public/audio-processor.js` | 5 | AudioWorklet processor |
| `client/src/hooks/useAudioCapture/useAudioCapture.ts` | 5 | Audio capture hook |
| `client/src/hooks/useAudioCapture/wav-encoder.ts` | 5 | WAV encoding utility |
| `client/src/hooks/useAudioCapture/wav-encoder.test.ts` | 5 | WAV encoder tests |
| `client/src/hooks/useAudioCapture/index.ts` | 5 | Barrel export |
| `client/src/hooks/useDictation/useDictation.ts` | 5 | Dictation orchestration hook |
| `client/src/hooks/useDictation/useDictation.test.ts` | 5 | Dictation hook tests |
| `client/src/hooks/useDictation/types.ts` | 5 | Dictation state/action types |
| `client/src/hooks/useDictation/index.ts` | 5 | Barrel export |
| `client/src/pages/DictationPage/DictationPage.tsx` | 5 | Dictation page orchestrator |
| `client/src/pages/DictationPage/types.ts` | 5 | Page types |
| `client/src/pages/DictationPage/hooks/useDictationPage.ts` | 5 | Page-level hook |
| `client/src/pages/DictationPage/components/PreflightCheck.tsx` | 5 | Service status indicators |
| `client/src/pages/DictationPage/components/TranscriptPanel.tsx` | 5 | Raw + processed text areas |
| `client/src/pages/DictationPage/components/DictationControls.tsx` | 5 | Start/Stop/Copy buttons |
| `client/src/pages/DictationPage/components/ModelDownload.tsx` | 5 | Model download UI |
| `client/src/pages/DictationPage/components/ModelDownload.test.tsx` | 5 | Model download tests |
| `client/src/pages/DictationPage/DictationPage.test.tsx` | 5 | Page tests |
| `client/src/pages/DictationPage/index.ts` | 5 | Barrel export |
| `client/src/hooks/useF4Dictation/useF4Dictation.ts` | 6 | F4 headless dictation hook |
| `client/src/hooks/useF4Dictation/useF4Dictation.test.ts` | 6 | F4 hook tests |
| `client/src/hooks/useF4Dictation/index.ts` | 6 | Barrel export |

### Modified Files

| File | Branch | Description |
|------|--------|-------------|
| `shared/types/config.ts` | 1 | Add `DictationConfig` and `dictation` field to `WeaverConfig` |
| `shared/types/index.ts` | 1 | Re-export dictation types |
| `shared/paths/paths.ts` | 1 | Add snippetsPath, dictationsPath, modelsDir |
| `server/src/services/config/validators/field.ts` | 1 | Add `validateDictation` validator |
| `server/src/services/config/validators/field.test.ts` | 1 | Add dictation validation tests |
| `server/src/index.ts` | 2, 3 | Register snippets and dictation routes |
| `desktop/src/main.ts` | 4 | Register F4 shortcut, import dictation module |
| `desktop/src/server.ts` | 4 | Pass WEAVER_WHISPER_BIN env var |
| `desktop/src/preload.ts` | 4 | Add dictation IPC bridge methods |
| `desktop/package.json` | 4 | Add whisper-server to extraResources |
| `package.json` (root) | 4 | Add build:whisper script, update dist |
| `client/src/hooks/notifications/soundUtils.ts` | 5 | Add dictation sounds |
| `client/src/types/weaver-bridge.d.ts` | 6 | Add dictation bridge methods |
| `client/src/App.tsx` | 6 | Add routes, conditional sidebar entries, mount F4 hook |
| `client/src/hooks/useWindowList/useWindowList.ts` | 6 | Add conditional command palette entries |
| `client/src/pages/SettingsPage/SettingsPage.tsx` | 6 | Add dictation config section |
| `client/src/pages/SettingsPage/SettingsPage.test.tsx` | 6 | Add tests for dictation fields |

## TESTING STRATEGY

### Development Workflow Level: Complex (ATDD + BDD + TDD)

### Level 1: Acceptance Criteria (ATDD)

AC1: Given the user is on the Dictation page with services healthy, when they click Start Dictation and speak, then the raw transcript area updates with transcribed text every few seconds.

AC2: Given the user is recording, when they click Stop Dictation, then the LLM processes the transcript and the processed output appears in the second text area.

AC3: Given processed text exists, when the user clicks Copy to Clipboard, then the text is copied as plain text.

AC4: Given the user presses F4 and speaks, when they press F4 again, then the processed text is copied to clipboard and native macOS notifications appear at each stage ("Listening...", "Processing...", "Copied to clipboard!").

AC5: Given whisper-server is not running, when the user opens the Dictation page, then the status indicator shows red and the Start button is disabled.

AC6: Given Ollama is not running, when the user opens the Dictation page, then the Ollama status indicator shows red and the Start button is disabled.

AC7: Given no whisper model is downloaded, when the user opens the Dictation page, then the model download UI is shown with available models and progress indication.

AC8: Given the user creates a snippet with trigger "insert intro" and expansion "Hello, I am...", when they dictate "Insert Intro" (exact match after alpha filtering), then the processed output is the expansion text.

AC9: Given the user is in the web version (not Electron), when they view the sidebar, then Dictation and Snippets links are not visible.

AC10: Given F4 is active, when the user is on the Dictation page, then all controls are disabled and an info Alert is shown.

AC11: Given the user completes a dictation, when the result is returned, then an entry is logged to `~/.weaver/dictations.jsonl`.

AC12: Given the user opens Settings in Electron, when they scroll to the Dictation section, then they can configure Ollama URL and model with a Test Connection button.

### Level 2: Behavioral Scenarios (BDD)

Scenarios are defined inline within each step above. Key scenario groups:
- Pre-flight check scenarios (Step 15)
- Recording flow scenarios (Step 14, 15)
- Snippet matching scenarios (Step 5)
- F4 flow scenarios (Step 21)
- Model download scenarios (Step 17)
- Snippets CRUD scenarios (Step 16)

### Level 3: Unit-Level TDD Targets

| Module | Branch | Complexity Warranting TDD |
|--------|--------|--------------------------|
| `snippet-matcher.ts` | 2 | Pure algorithm with specific matching rules |
| `whisper-server.ts` | 3 | Process lifecycle state machine |
| `ollama-client.ts` | 3 | HTTP client with multiple failure modes |
| `wav-encoder.ts` | 5 | Binary encoding with specific header format |
| `validateDictation` | 1 | Nested object validation with partial merging |

### Manual Testing Steps

1. Build app with `npm run dist`, launch, verify whisper-server binary is bundled
2. Open Dictation page, verify pre-flight checks run
3. Download a whisper model via the UI, verify progress and completion
4. Start dictation, speak, verify raw transcript updates
5. Stop dictation, verify processed output appears
6. Copy to clipboard, verify text
7. Test F4 shortcut with window hidden: verify sounds and notifications
8. Create/edit/delete snippets, verify they trigger during dictation
9. Verify Dictation and Snippets are hidden in browser dev mode
10. Verify Settings page shows dictation config in Electron only

## RISKS & MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| whisper.cpp build fails on different machines | Medium | High | Build script checks for dependencies (cmake, make), provides clear error messages. Binary is committed or cached. |
| AudioWorklet microphone permission denied | Low | Medium | Show clear error message with instructions. Check permission before enabling Start button. |
| Ollama model produces poor cleanup results | Medium | Medium | Recommend specific models with tested prompts. Allow users to change model in settings. |
| whisper-server crashes during transcription | Low | Medium | Health check before each request. Auto-restart on crash. Show error Alert with retry. |
| AudioContext prevents system sleep | Medium | Low | Manual suspend/resume lifecycle. Tested pattern from Doist/Ramble. |
| Large model download fails mid-way | Medium | Medium | Clean up partial files. Show retry button. Resume not supported (restart download). |

### Rollback Strategy

- Feature is entirely additive (no existing behavior modified)
- Desktop-only gating means web users are unaffected
- Config changes are backward-compatible (new `dictation` key with defaults)
- whisper-server binary is isolated in extraResources
- Reverting: remove routes, pages, and config key. No data migration needed.

## DEPENDENCIES

### External Systems

| System | Requirement | User Action |
|--------|------------|-------------|
| Ollama | Must be installed and running with a pulled model | User installs via `brew install ollama`, runs `ollama pull phi4-mini` |
| whisper.cpp | Source code needed for build script | Build script clones automatically |
| Hugging Face | Model download URLs must be accessible | First-run model download requires internet |

### Build Dependencies

| Dependency | Purpose |
|-----------|---------|
| CMake | Building whisper.cpp from source |
| Xcode Command Line Tools | C++ compiler for whisper.cpp |

### Infrastructure Changes

- New `desktop/resources/whisper-server` binary in electron-builder extraResources
- New files in `~/.weaver/`: `snippets.jsonl`, `dictations.jsonl`, `models/` directory
- New port: 8178 (whisper-server)

### No Team Dependencies or Approvals Required

This is a self-contained feature addition with no external team dependencies.
