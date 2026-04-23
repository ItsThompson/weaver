# Dictation Service Lifecycle Redesign: Implementation Plan

## Overview

### Problem

Dictation preflight checks are unreliable due to cold-start timing. The `GET /api/dictation/status` endpoint starts whisper and ollama as a side effect, but if services are still cold-starting, the check returns false and the UI shows a hard failure. Related problems:

- Services only start when the user visits the dictation page (no eager startup)
- The status endpoint has side effects, making it unsafe to call from multiple places
- The F4 hotkey has no awareness of service readiness
- No `enable_dictation` toggle exists: services are implicitly enabled by visiting the dictation page
- The `llm_cleanup` toggle doesn't react to runtime changes (ollama keeps running when disabled, doesn't start when enabled after initial check)
- Whisper's 5-minute inactivity timeout silently kills the server, causing repeated cold starts

### Success Criteria

1. Services start eagerly on server startup based on config values
2. A startup status page shows per-service readiness as a checklist before the app is usable
3. `enable_dictation` (new, top-level config) controls whether whisper starts; `dictation.llm_cleanup` controls whether ollama starts
4. Config changes that affect service lifecycle trigger an in-process service restart with user confirmation
5. The F4 hotkey respects service readiness and dictation enabled state
6. The dictation page gracefully handles disabled and error states
7. The side-effect-laden `/api/dictation/status` endpoint is removed
8. Whisper's inactivity timeout is removed

### Assumptions and Constraints

- The existing `processTranscript` race condition in `useDictation` will be fixed separately before this work begins
- The app runs on macOS only (Electron desktop app)
- Cloudscape Design System is used for all UI components
- The server is a Fastify app; the desktop wrapper is Electron
- `enable_dictation` defaults to `false`: existing users who already use dictation will need to enable it after upgrading (known breaking change)

## Approach

### High-Level Solution Design

The server becomes the owner of service lifecycle. On startup, it reads config and eagerly starts whisper and/or ollama. A new side-effect-free `GET /api/services/status` endpoint exposes per-service state. The frontend defaults to a startup status page that polls this endpoint every 1 second and shows a checklist. Once all configured services have settled (reached a terminal state: `running`, `error`, or `not_configured`), the app transitions to the normal UI. A service that fails to start does not block the app: it transitions to `error` and the startup page still completes.

Config changes to service-affecting fields trigger an in-process service restart (not a full server restart: the Fastify process stays up, only whisper/ollama child processes are stopped and restarted). The server emits a `servicesRestarting` SSE event, and the frontend returns to the startup status page until services are ready again.

Dictation routes no longer start or manage services directly. They check service status via the service manager and fail fast with a 503 if a required service is not running. The dictation page and F4 hotkey both check service readiness before allowing operations.

### Key Architectural Decisions

1. **`enable_dictation` is top-level, not inside `dictation` object.** It controls whether the entire dictation subsystem starts, which is a top-level app concern (affects server startup, startup status page duration, F4 hotkey behavior, dictation page state). The `dictation` object remains for dictation-specific tuning (model, URL, mic, cleanup).

2. **Liveness and readiness are separate endpoints.** Following industry best practice (Kubernetes probe patterns), `/api/health` stays as a pure liveness check (always 200 if server is up). A new `GET /api/services/status` returns per-service readiness with no side effects. This gives clean separation: Electron knows "server is listening" via health, frontend knows "services are ready" via services/status.

3. **In-process service restart, not server restart.** Fastify routes read config dynamically via `readConfig()` on each request. Whisper and ollama are child processes managed via `createManagedProcess`. No server-level state depends on dictation config values. Therefore, only the child processes need to be stopped and restarted when service-affecting config changes: the Fastify server stays up throughout.

4. **Restart-requiring fields are explicitly defined server-side.** The server compares old and new config on save and determines whether a service restart is needed. The set of restart-requiring fields: `enable_dictation`, `dictation.llm_cleanup`, `dictation.ollama_url`, `dictation.ollama_model`.

5. **Service manager accepts injected dependencies.** The service manager factory (`createServiceManager`) accepts start/stop/check functions for whisper and ollama as parameters, rather than importing them directly. This makes the service manager fully testable with stubs and follows the "accept dependencies, don't create them" principle.

6. **Service manager instance lives in a separate module.** To avoid circular dependencies between `index.ts` (which registers routes) and routes (which need the service manager), the singleton instance is created in `server/src/services/service-manager-instance.ts`. Routes and `index.ts` both import from this module.

7. **Routes fail fast when services are down.** The `/api/dictation/transcribe` and `/api/dictation/process` routes check service status via the service manager before attempting operations. If a required service is not running, they return 503 immediately. No route attempts to start services on the fly: the service manager owns all lifecycle.

8. **Model download starts whisper as a side effect.** After a successful model download, if `enable_dictation` is true and whisper isn't running, the download endpoint starts whisper via the service manager. No separate "start services" endpoint is needed.

9. **Whisper inactivity timeout is removed.** With eager startup, whisper stays alive as long as the app is running and `enable_dictation` is true.

### Development Workflow

This is a complex task: cross-module integration (server, client, desktop, shared types), complex state management (service lifecycle, startup flow, restart flow), and multiple failure modes. Using Levels 1 + 2 + 3: ATDD → BDD → TDD.

## Implementation Steps

### Step 1: Add `enable_dictation` to shared types and config

Add the `enable_dictation` field to the config type and defaults. Update the config validator.

**Files to modify:**
- `shared/types/config.ts`: Add `enable_dictation: boolean` to `WeaverConfig`, default `false` in `DEFAULT_CONFIG`
- `server/src/services/config/validators/field.ts`: Add `enable_dictation` validator to `FIELD_VALIDATORS`, reuse `validateBoolean`

**Deliverable:** Config can be read and written with the new field. Existing configs without the field get the default value (`false`).

---

### Step 2: Define service status types

Create shared types for service status that both server and client use.

**Files to create:**
- `shared/types/services.ts`: Define `ServiceState` (`"running"` | `"starting"` | `"stopped"` | `"error"` | `"not_configured"`), `ServiceStatus` (per-service state with optional error message), `ServicesStatusResponse` (`{ ready: boolean, services: { whisper: ServiceStatus, ollama: ServiceStatus } }`), and `SERVICE_RESTART_FIELDS`: a constant array of config paths that require a service restart when changed (`["enable_dictation", "dictation.llm_cleanup", "dictation.ollama_url", "dictation.ollama_model"]`). This single definition is imported by both the server (`restart-fields.ts`) and client (`useSettings.ts`) to prevent divergence. The `ready` field means "all configured services have reached a terminal state": `running`, `error`, or `not_configured`. A service stuck in `starting` keeps `ready` as `false`; a service that failed to start (`error`) does NOT block readiness. This prevents a misconfigured service from deadlocking the app on the startup page.

**Files to modify:**
- `shared/types/index.ts`: Export from `services.ts`

**Deliverable:** Shared types and restart field list available for both server and client.

---

### Step 3: Build the service manager factory (server)

Create a service manager factory that accepts injected dependencies and owns the lifecycle of whisper and ollama. It reads config, starts services, tracks their state, and exposes current status.

**Files to create:**
- `server/src/services/service-manager.ts`: Exports `createServiceManager(deps)` where deps is:

```typescript
interface ServiceManagerDeps {
  startWhisper: (modelPath: string) => void;
  waitForWhisperReady: () => Promise<boolean>;
  isWhisperRunning: () => Promise<boolean>;
  stopWhisper: () => void;
  ensureOllamaRunning: (url: string) => Promise<boolean>;
  checkOllamaHealth: (url: string) => Promise<boolean>;
  stopOllama: () => void;
  getDefaultModelPath: () => Promise<string | null>;
  readConfig: () => Promise<{ config: WeaverConfig }>;
}
```

The `startWhisper` dep takes only `modelPath`. The whisper binary path is hidden inside the dep closure (wired in `service-manager-instance.ts`), following the "deep module" principle: callers don't need to know where the binary lives.

Returns an object with methods:
  - `start(config)`: Reads `enable_dictation` and `dictation.llm_cleanup` from config, starts services accordingly, updates internal state. Serialized via an internal mutex: if a `start()` or `stop()` is already in progress, the new call waits for it to complete before proceeding. This prevents interleaved state transitions from rapid config saves.
  - `stop()`: Stops all running services. Also serialized via the same mutex.
  - `getStatus()`: Returns `ServicesStatusResponse`. Checks liveness of running services on each call: if internal state says `running` but the service is no longer alive, transitions state to `error`. This detects services that crash after startup. The `ready` field is `true` when every configured service has reached a terminal state (`running`, `error`, or `not_configured`): a service in `starting` keeps `ready` as `false`, but a service in `error` does not.
  - `startWhisperIfReady()`: Starts whisper if `enable_dictation` is true, a model exists, and whisper isn't already running (used by model download)

Internal state tracks each service as a `ServiceState`. Transitions: `stopped` → `starting` → `running` (or `error`). The `getStatus()` liveness check uses `deps.isWhisperRunning()` (which does an HTTP health check) for whisper and `deps.checkOllamaHealth(url)` for ollama. Neither has side effects.

**Key behavior:**
- Whisper: starts if `enable_dictation` is true AND a model exists (`getDefaultModelPath()` returns non-null). State is `not_configured` if no model exists.
- Ollama: starts if `enable_dictation` is true AND `dictation.llm_cleanup` is true. State is `not_configured` if either condition is false.
- If a service fails to start (e.g., `waitForWhisperReady` returns false), state transitions to `error`

**Deliverable:** Service manager factory can be instantiated with real or test dependencies.

---

### Step 4: Create service manager instance and integrate into server startup

Create the singleton instance with real dependencies and wire it into the server's startup and shutdown flow.

**Files to create:**
- `server/src/services/service-manager-instance.ts`: Imports `createServiceManager` and the real whisper/ollama functions. Imports whisper functions from `services/dictation/index` (barrel). Imports `ensureOllamaRunning` directly from `services/dictation/ollama-server` and `checkOllamaHealth` from `services/dictation/ollama-client` (these are removed from the barrel in Step 18, so direct imports avoid breakage). Reads `process.env.WEAVER_WHISPER_BIN` and closes over it in the `startWhisper` dep: `startWhisper: (modelPath) => startWhisperServer(whisperBin, modelPath)`. This hides the binary path from the service manager interface. Creates and exports the singleton `serviceManager` instance with all real dependencies wired in.

**Files to modify:**
- `server/src/services/dictation/whisper-server.ts`: Remove the `inactivityTimeoutMs` from the `createManagedProcess` config (remove the field entirely)
- `server/src/index.ts`:
  - Import `serviceManager` from `./services/service-manager-instance`
  - After `server.listen()`, call `serviceManager.start(config)` with the loaded config
  - In the shutdown handler, call `serviceManager.stop()` instead of directly calling `stopOllamaServer()` / `stopWhisperServer()`
  - Remove direct imports of `stopOllamaServer`, `stopWhisperServer`

**Deliverable:** Services start eagerly on server startup based on config. The service manager instance is importable by any route module without circular dependencies.

---

### Step 5: Add `GET /api/services/status` endpoint

Create the new side-effect-free readiness endpoint.

**Files to create:**
- `server/src/routes/services.ts`: Import `serviceManager` from `../services/service-manager-instance`. Register `GET /api/services/status` that calls `serviceManager.getStatus()` and returns the result.
- `server/src/routes/services.test.ts`: Tests for the endpoint

**Files to modify:**
- `server/src/index.ts`: Register the new route

**Deliverable:** Frontend can poll service readiness without side effects.

---

### Step 6: Remove `GET /api/dictation/status` endpoint and update routes to fail fast

Remove the side-effect-laden status endpoint. Update dictation routes to check service status via the service manager and fail fast when services are down.

**Files to modify:**
- `server/src/routes/dictation/dictation.ts`:
  - Remove the `whisperBinPath` parameter from the `registerDictationRoutes` function signature (change to `registerDictationRoutes(server: FastifyInstance)`)
  - Remove the `/api/dictation/status` route handler entirely
  - Remove imports: `isWhisperServerRunning`, `startWhisperServer`, `waitForWhisperReady`, `touchWhisperActivity`, `ensureOllamaRunning`
  - Import `serviceManager` from `../../services/service-manager-instance`
  - `/api/dictation/transcribe`: Remove the cold-start logic (checking `isWhisperServerRunning`, calling `startWhisperServer`, `waitForWhisperReady`). Instead, check `serviceManager.getStatus()` at the top: if whisper is not `running`, return `503 { error: "Whisper is not available. Check service status." }`. Remove the `touchWhisperActivity()` call. Remove the now-unused `whisperBinPath` and `modelPath` checks at the top (the service manager owns startup; the route only needs to verify whisper is running).
  - `/api/dictation/process`: Remove the `ensureOllamaRunning(ollama_url)` call. Instead, when `llm_cleanup` is true, check `serviceManager.getStatus()`: if ollama is not `running`, return `503 { error: "Ollama is not available. Check service status." }`
- `server/src/index.ts`: Update the `registerDictationRoutes` call to `registerDictationRoutes(server)` (remove the `process.env.WEAVER_WHISPER_BIN` argument, which is now consumed only by `service-manager-instance.ts`)
- `server/src/routes/dictation/dictation.test.ts`: Remove tests for the status endpoint. Update transcribe and process tests to mock the service manager instead of individual service functions. Remove `touchWhisperActivity` mock and assertions.
- `client/src/utils/api.ts`: Add `getServicesStatus` function that calls `GET /api/services/status` and returns `ServicesStatusResponse`. Keep `getDictationStatus` for now (still imported by SettingsPage and useDictation; removed in Step 18 after all consumers are migrated).
- `client/src/__tests__/mocks/api.ts`: Add `getServicesStatus` mock. Keep `getDictationStatus` mock for now (removed in Step 18).

**Deliverable:** No more side-effect status checks. Routes fail fast when services are down. All service status comes from the new endpoint.

---

### Step 7: Add service restart detection to config routes

When config is saved (PUT or PATCH), detect whether service-affecting fields changed and trigger an in-process service restart if so. The restart is fire-and-forget: the handler emits the SSE event, kicks off the restart without awaiting, and returns the HTTP response immediately. The frontend shows the startup status page via the SSE event and polls `/api/services/status` to track progress.

**Files to create:**
- `server/src/routes/restart-fields.ts`: Export a `needsServiceRestart(oldConfig, newConfig)` function that imports `SERVICE_RESTART_FIELDS` from `@weaver/shared/types` and compares those fields between old and new config. Returns a boolean. Keep this isolated for testability.
- `server/src/routes/restart-fields.test.ts`: Tests for the comparison logic

**Files to modify:**
- `server/src/routes/config.ts`:
  - Import `serviceManager` from `../services/service-manager-instance` and `needsServiceRestart` from `./restart-fields`
  - In both PUT and PATCH handlers, after validation but before writing: read the current config and compare against the new config using `needsServiceRestart`
  - If restart needed: write config, emit `configChanged` SSE event, emit `servicesRestarting` SSE event, then kick off `serviceManager.stop()` followed by `serviceManager.start(newConfig)` without awaiting (fire-and-forget). Log any errors from the restart promise via `.catch()`.
  - If no restart needed: write config and emit `configChanged` as before

**Deliverable:** Config saves that affect service lifecycle trigger an in-process service restart with an SSE notification. The HTTP response returns immediately without waiting for the restart to complete.

---

### Step 8: Model download starts whisper on success

After a successful model download, start whisper if conditions are met.

**Files to modify:**
- `server/src/routes/dictation/dictation.ts`: Import `serviceManager` from `../../services/service-manager-instance` (if not already imported from Step 6). In the `/api/dictation/models/download` handler, after writing `{ complete: true }` to the SSE stream, call `serviceManager.startWhisperIfReady()`. This starts whisper if `enable_dictation` is true, a model now exists, and whisper isn't already running.

**Deliverable:** First-time model download automatically starts whisper without requiring a service restart.

---

### Step 9: Create shared `useSSE` hook (client)

Extract a generic SSE subscription hook that manages the `EventSource` lifecycle. Both `useSessionEvents` and the new `useServiceEvents` (Step 12) use it to avoid duplicating EventSource boilerplate.

**Files to create:**
- `client/src/hooks/useSSE/useSSE.ts`: Hook that accepts a stable map of event names to handler functions. Creates an `EventSource("/api/events")` on mount, registers a listener for each event that parses `event.data` as JSON and calls the handler, and closes the source on unmount. Accepts an optional `deps` array for controlling when the connection is re-established.
- `client/src/hooks/useSSE/useSSE.test.ts`: Tests using the existing `MockEventSource` infrastructure
- `client/src/hooks/useSSE/index.ts`: Barrel export

**Files to modify:**
- `client/src/hooks/useSessionEvents/useSessionEvents.ts`: Refactor to use `useSSE` for the EventSource lifecycle. The debouncing logic stays in this hook: the pending timers map is stored in a `useRef` so it persists across renders, and the handler functions passed to `useSSE` close over this ref. The `update` handler manages the pending timers map, the `configChanged` handler calls `revalidateConfig` directly. The cleanup function from `useSSE` handles closing the EventSource; this hook's own cleanup (a separate `useEffect`) handles clearing pending timers on unmount.
- `client/src/hooks/useSessionEvents/useSessionEvents.test.ts`: Update if the refactor changes any observable behavior (it shouldn't: same events, same debouncing, same cleanup)

**Deliverable:** Shared SSE hook that eliminates EventSource boilerplate. `useSessionEvents` refactored to use it.

---

### Step 10: Create `useServicesStatus` hook (client)

Create a shared hook for fetching service status, used by both the startup page and the dictation page.

**Files to create:**
- `client/src/hooks/useServicesStatus/useServicesStatus.ts`: Hook that calls `GET /api/services/status` on mount. Returns `{ status: ServicesStatusResponse | null, loading: boolean, refetch: () => void }`. Does NOT poll by default (one-shot fetch with manual `refetch`). Accepts an optional `pollInterval` parameter: when provided, re-fetches on that interval (used by the startup page).
- `client/src/hooks/useServicesStatus/useServicesStatus.test.ts`: Tests for the hook: fetches on mount, returns loading/status/refetch, polls when `pollInterval` is set, stops polling on unmount
- `client/src/hooks/useServicesStatus/index.ts`: Barrel export

**Deliverable:** Shared hook for service status, reusable across pages with optional polling.

---

### Step 11: Build the startup status page (client)

Create the new startup status page that shows a checklist of service readiness.

**Files to create:**
- `client/src/pages/StartupPage/StartupPage.tsx`: The startup status page component. Uses `useServicesStatus({ pollInterval: 1000 })` to poll every 1 second. Displays a checklist using Cloudscape `StatusIndicator` components:
  - Each configured service gets a row: service name + status icon (success checkmark for `running`, in-progress spinner for `starting`, error icon for `error`/`stopped`, info icon for `not_configured`)
  - When `ready: true` is returned (all services have reached a terminal state: `running`, `error`, or `not_configured`), calls an `onReady` callback to exit the startup page. A service in `error` does NOT block the transition: the user can reach Settings or the dictation page to see the error and fix it.
  - If no services are configured (`enable_dictation` is false), transitions immediately
  - After 30 seconds without `ready: true`, shows a "Skip and continue" link that calls `onReady` directly. This prevents the user from being stuck if a service hangs in `starting` (e.g., whisper binary exists but hangs on startup). The link is subtle (not a primary button) to discourage skipping under normal conditions.
- `client/src/pages/StartupPage/StartupPage.test.tsx`: Tests
- `client/src/pages/StartupPage/index.ts`: Barrel export

**Deliverable:** A Cloudscape-styled checklist page that shows per-service startup progress.

---

### Step 12: Create `useServiceEvents` hook (client)

Create a hook that listens for service-related SSE events using the shared `useSSE` hook from Step 9.

**Files to create:**
- `client/src/hooks/useServiceEvents/useServiceEvents.ts`: Uses `useSSE` to listen for the `servicesRestarting` event. Accepts an `onServicesRestarting` callback. When the event fires, calls the callback.
- `client/src/hooks/useServiceEvents/useServiceEvents.test.ts`: Tests using `dispatchSSE("servicesRestarting", {})`
- `client/src/hooks/useServiceEvents/index.ts`: Barrel export

**Deliverable:** Dedicated hook for service SSE events, built on the shared `useSSE` infrastructure.

---

### Step 13: Integrate startup status page into app shell

Wire the startup status page into the app's routing so it shows by default and transitions to the normal app when services are ready.

**Files to modify:**
- `client/src/App.tsx`:
  - Add state to track whether the app is in "startup" mode (default: `true`)
  - When in startup mode, render `StartupPage` with an `onReady` callback that sets startup mode to `false`
  - Use `useServiceEvents({ onServicesRestarting: () => setStartup(true) })` to return to the startup status page when services restart
  - When startup completes, render the normal `AppLayout` with routes

**Deliverable:** App defaults to startup status page and transitions to normal UI when ready. SSE `servicesRestarting` event returns to startup status page.

---

### Step 14: Add service restart confirmation modal to settings page

When saving settings that require a service restart, show a confirmation modal.

**Files to create:**
- `client/src/pages/SettingsPage/components/ServiceRestartModal/ServiceRestartModal.tsx`: Modal with "Save and restart services" and "Cancel" buttons. "Save and restart services" calls the save handler. "Cancel" closes the modal without saving (the user's unsaved form changes persist in the UI, which is intentional).
- `client/src/pages/SettingsPage/components/ServiceRestartModal/ServiceRestartModal.test.tsx`: Tests
- `client/src/pages/SettingsPage/components/ServiceRestartModal/index.ts`: Barrel export

**Files to modify:**
- `client/src/pages/SettingsPage/hooks/useSettings.ts`: Add logic to detect whether the pending changes include restart-requiring fields. Import `SERVICE_RESTART_FIELDS` from `@weaver/shared/types` and compare the current saved config against the local edited config for those fields. Expose a `needsServiceRestart` boolean.
- `client/src/pages/SettingsPage/SettingsPage.tsx`:
  - Remove: `testingConnection` state, `connectionResult` state, `handleTestConnection` function, the "Test Connection" `Button`, the `StatusIndicator` below it, and the `getDictationStatus` import
  - Add: use `useServicesStatus` hook to show an inline `StatusIndicator` next to the Ollama URL field displaying current ollama status (`running`/`stopped`/`error`/`not_configured`). This is read-only, no button needed.
  - Add the `enable_dictation` toggle at the top of the dictation section
  - Disable/grey out other dictation fields when `enable_dictation` is false
  - Disable `llm_cleanup` toggle when `enable_dictation` is false
  - On save click: if `needsServiceRestart` is true, show the `ServiceRestartModal` instead of saving directly. If `needsServiceRestart` is false, save normally.

**Deliverable:** Users see a service restart warning before saving service-affecting config changes. Dictation fields are properly gated by `enable_dictation`. Ollama status is shown inline without a test connection button.

---

### Step 15: Update dictation page for disabled and error states

Update the dictation page to handle the new `enable_dictation` toggle and service error states. The dictation page uses `useServicesStatus` to stay informed about service state after the startup page transitions away.

**Files to modify:**
- `client/src/pages/DictationPage/DictationPage.tsx`:
  - Add `useServicesStatus` hook call to get current service state on mount
  - When `enable_dictation` is false (from config): show an alert "Dictation is disabled. Enable it in Settings." and hide the dictation controls
  - When whisper or ollama is in `error` or `stopped` state: show an alert "Dictation is unavailable" with a suggestion to check Settings
  - Remove the `checkServices` call on mount
  - Remove the `PreflightCheck` component usage (replaced by the startup status page and inline status)
  - After model download completes, call `refetch()` from `useServicesStatus` to pick up the new whisper state
  - The `DictationControls` start button is disabled when whisper is not in `running` state
- `client/src/hooks/useDictation/useDictation.ts`:
  - Remove `checkServices` action and related state (`whisperStatus`, `ollamaStatus`, `ollamaError`, `ollamaModel`, `hasModel`)
  - Remove the `preflight_checking` phase
  - Remove `getDictationStatus` import
  - The hook now focuses purely on recording/transcription/processing
- `client/src/hooks/useDictation/types.ts`: Remove preflight-related fields from `DictationState` (`whisperStatus`, `ollamaStatus`, `ollamaError`, `ollamaModel`, `hasModel`) and remove `checkServices` from `DictationActions`. Remove `preflight_checking` from `DictationPhase`.
- `client/src/pages/DictationPage/types.ts`: Remove `PreflightCheckProps` (component is removed)
- `client/src/pages/DictationPage/components/PreflightCheck.tsx`: Delete this file

**Deliverable:** Dictation page cleanly handles disabled and error states. Service status is checked via `useServicesStatus` on mount, not via the old preflight flow.

---

### Step 16: Update F4 hotkey handler

Make the F4 hotkey aware of `enable_dictation` and service readiness. Pass deps directly to `handleDictationHotkey` rather than threading them through `setupDictation`, which remains focused on IPC setup.

**Files to modify:**
- `desktop/src/dictation.ts`:
  - `setupDictation` remains unchanged (IPC setup only)
  - `handleDictationHotkey` signature changes to accept a deps object: `{ getConfig: () => WeaverConfig, serverUrl: string }`
  - `handleDictationHotkey` becomes async and uses the deps:
    1. Check `deps.getConfig().enable_dictation`. If false: notify "Dictation is disabled. Enable it in Settings." and return.
    2. Call `fetch(\`${deps.serverUrl}/api/services/status\`)` and parse the JSON response.
    3. If `!response.ready`: notify "Dictation services are still starting. Please wait." and return.
    4. If fetch fails (server unreachable): notify "Cannot reach Weaver server." and return.
    5. Proceed with existing start/stop toggle logic.
  - The HTTP call adds ~5-20ms latency on localhost, which is imperceptible.
- `desktop/src/main.ts`:
  - `setupDictation()` call stays as-is (no deps needed)
  - Update `globalShortcut.register("F4", ...)` to pass deps to the now-async `handleDictationHotkey`: `() => handleDictationHotkey({ getConfig: () => currentConfig, serverUrl: server.SERVER_URL })`

**Deliverable:** F4 hotkey gives clear feedback when dictation is disabled or services aren't ready, using live service status from the endpoint.

---

### Step 17: Update model download to trigger whisper start

Wire the model download completion to the service manager and update the client to reflect the new state.

**Files to modify:**
- `client/src/pages/DictationPage/hooks/useModelDownload.ts`: The `onComplete` callback no longer calls `checkServices` (removed in Step 15). Instead, it calls `refetch()` from the `useServicesStatus` hook (passed in as a parameter or via a callback prop).
- `client/src/pages/DictationPage/DictationPage.tsx`: After model download completes, the `useServicesStatus` refetch picks up the new whisper state (whisper transitions from `not_configured` to `starting` to `running`).

**Deliverable:** Model download seamlessly starts whisper and the UI reflects the new state.

---

### Step 18: Clean up removed code

Remove all dead code and unused imports left over from the refactoring.

**`touchWhisperActivity` removal:**
- `server/src/services/dictation/whisper-server.ts`: Delete the `touchWhisperActivity` function
- `server/src/services/dictation/index.ts`: Remove `touchWhisperActivity` from exports
- `server/src/services/dictation/whisper-server.test.ts`: Remove the two `touchWhisperActivity` tests ("resets the timer on touchWhisperActivity" and "touchWhisperActivity is a no-op when not running") and the import

**`ensureOllamaRunning` removal:**
- `server/src/services/dictation/index.ts`: Remove `ensureOllamaRunning` from exports (no longer imported by routes; still used internally by `service-manager-instance.ts`, which imports directly from `./ollama-server`)

**Route dead code (from Step 6 changes):**
- `server/src/routes/dictation/dictation.ts`: Verify no remaining imports of `isWhisperServerRunning`, `startWhisperServer`, `waitForWhisperReady`, `touchWhisperActivity`, `ensureOllamaRunning` (all removed in Step 6)
- `server/src/routes/dictation/dictation.test.ts`: Verify no remaining mocks or assertions for `touchWhisperActivity`, `ensureOllamaRunning`, `isWhisperServerRunning`, `startWhisperServer`, `waitForWhisperReady` (all updated in Step 6)

**Server index cleanup:**
- `server/src/index.ts`: Verify no remaining direct imports of `stopOllamaServer`, `stopWhisperServer` (replaced by service manager in Step 4)

**Client cleanup:**
- `client/src/utils/api.ts`: Remove `getDictationStatus` function (all consumers migrated in Steps 14 and 15)
- `client/src/__tests__/mocks/api.ts`: Remove `getDictationStatus` mock
- `client/src/pages/DictationPage/components/PreflightCheck.tsx`: Verify file is deleted (from Step 15)
- `client/src/pages/SettingsPage/SettingsPage.test.tsx`: Remove `mockGetDictationStatus` setup and all test references to the old test connection flow

**Deliverable:** No dead code remains. All imports, exports, mocks, and test assertions reference only the new service manager pattern.

---

### Step 19: Update documentation

Update user-facing documentation to reflect the new service lifecycle, `enable_dictation` config option, startup status page, and API changes.

**Files to create:**
- `server/docs/services.md`: Document the new `GET /api/services/status` endpoint: parameters (none), success response (`200 OK` with `ServicesStatusResponse` shape), field descriptions (`ready`, `services.whisper`, `services.ollama`, each with `state` and optional `error`). Include example responses for all-running, partially-configured, and error states.

**Files to modify:**
- `docs/configuration.md`:
  - Add `enable_dictation` row to the global config table: type `boolean`, default `false`, description "Enable the dictation subsystem (whisper and optionally ollama). Desktop app only."
  - Update the Dictation subsection: add `enable_dictation` description, note that changing `enable_dictation`, `dictation.llm_cleanup`, `dictation.ollama_url`, or `dictation.ollama_model` triggers a service restart with a confirmation prompt
  - Remove the sentence about the "Test Connection" button
  - Update the example JSON to include `enable_dictation: true`
- `docs/features/dictation.md`:
  - Add an "Enabling dictation" section near the top explaining the `enable_dictation` toggle (default off, enable via Settings)
  - Replace the "Preflight checks" subsection: describe the startup status page (shows a checklist of service readiness on app launch, transitions to the normal UI when all configured services are ready)
  - Update the "Hotkey quick capture" section: note that F4 checks whether dictation is enabled and services are ready before starting, and shows a notification if either condition is not met
  - Remove references to whisper starting "on demand" or "automatically when you begin dictation" (it now starts eagerly on server startup)
- `server/README.md`:
  - Add `GET /api/services/status` row to the API overview table with description "Per-service readiness status"
  - Remove the `GET /api/dictation/status` row
  - Add `[Services](docs/services.md)` to the docs list
- `server/docs/dictation.md`:
  - Remove the entire `GET /api/dictation/status` section
  - Update `POST /api/dictation/transcribe`: remove "Starts whisper-server on demand if it is not already running" from the description. Add a `503 Service Unavailable` error response: `{ "error": "Whisper is not available. Check service status." }`
  - Update `POST /api/dictation/process`: add a `503 Service Unavailable` error response: `{ "error": "Ollama is not available. Check service status." }` (returned when `llm_cleanup` is true and ollama is not running)

**Deliverable:** All user-facing documentation reflects the new service lifecycle, startup status page, `enable_dictation` config option, and API changes.

## Files to Modify/Create

### New Files

| File | Description |
|------|-------------|
| `shared/types/services.ts` | Service status types (`ServiceState`, `ServiceStatus`, `ServicesStatusResponse`) and `SERVICE_RESTART_FIELDS` constant |
| `server/src/services/service-manager.ts` | Service manager factory (`createServiceManager`) with injected deps |
| `server/src/services/service-manager-instance.ts` | Singleton instance wired with real dependencies |
| `server/src/routes/services.ts` | `GET /api/services/status` endpoint |
| `server/src/routes/services.test.ts` | Tests for services endpoint |
| `server/src/routes/restart-fields.ts` | `needsServiceRestart(old, new)` config comparison |
| `server/src/routes/restart-fields.test.ts` | Tests for restart field comparison |
| `client/src/hooks/useSSE/useSSE.ts` | Shared SSE subscription hook (EventSource lifecycle) |
| `client/src/hooks/useSSE/useSSE.test.ts` | Tests for shared SSE hook |
| `client/src/hooks/useSSE/index.ts` | Barrel export |
| `client/src/hooks/useServicesStatus/useServicesStatus.ts` | Shared hook for fetching service status (one-shot + optional polling) |
| `client/src/hooks/useServicesStatus/useServicesStatus.test.ts` | Tests for service status hook |
| `client/src/hooks/useServicesStatus/index.ts` | Barrel export |
| `client/src/hooks/useServiceEvents/useServiceEvents.ts` | Service-related SSE event hook (uses `useSSE`) |
| `client/src/hooks/useServiceEvents/useServiceEvents.test.ts` | Tests for service events hook |
| `client/src/hooks/useServiceEvents/index.ts` | Barrel export |
| `client/src/pages/StartupPage/StartupPage.tsx` | Startup status page with service checklist |
| `client/src/pages/StartupPage/StartupPage.test.tsx` | Tests for startup status page |
| `client/src/pages/StartupPage/index.ts` | Barrel export |
| `client/src/pages/SettingsPage/components/ServiceRestartModal/ServiceRestartModal.tsx` | Service restart confirmation modal |
| `client/src/pages/SettingsPage/components/ServiceRestartModal/ServiceRestartModal.test.tsx` | Tests for service restart modal |
| `client/src/pages/SettingsPage/components/ServiceRestartModal/index.ts` | Barrel export |
| `server/docs/services.md` | API documentation for `GET /api/services/status` endpoint |

### Modified Files

| File | Description |
|------|-------------|
| `shared/types/config.ts` | Add `enable_dictation` to `WeaverConfig` and `DEFAULT_CONFIG` |
| `shared/types/index.ts` | Export new service types |
| `server/src/services/config/validators/field.ts` | Add `enable_dictation` validator |
| `server/src/services/dictation/whisper-server.ts` | Remove inactivity timeout, delete `touchWhisperActivity` |
| `server/src/services/dictation/whisper-server.test.ts` | Remove `touchWhisperActivity` tests |
| `server/src/services/dictation/index.ts` | Remove `touchWhisperActivity` and `ensureOllamaRunning` exports (barrel only; functions remain in their source files) |
| `server/src/index.ts` | Integrate service manager instance, register services route, remove direct dictation service imports, remove `whisperBinPath` argument from `registerDictationRoutes` call |
| `server/src/routes/config.ts` | Add service restart detection on config save, emit `servicesRestarting` SSE event |
| `server/src/routes/dictation/dictation.ts` | Remove `whisperBinPath` parameter from `registerDictationRoutes`, remove status endpoint, remove cold-start logic from transcribe, remove `ensureOllamaRunning` from process, add service manager status checks, add whisper start on model download |
| `server/src/routes/dictation/dictation.test.ts` | Remove status endpoint tests, update transcribe/process tests for service manager pattern |
| `client/src/utils/api.ts` | Add `getServicesStatus` (keep `getDictationStatus` until Step 18) |
| `client/src/__tests__/mocks/api.ts` | Add `getServicesStatus` mock (keep `getDictationStatus` mock until Step 18) |
| `client/src/App.tsx` | Integrate startup status page, use `useServiceEvents` for `servicesRestarting` SSE event |
| `client/src/hooks/useSessionEvents/useSessionEvents.ts` | Refactored to use shared `useSSE` hook |
| `client/src/hooks/useDictation/useDictation.ts` | Remove preflight logic (`checkServices`, service status state) |
| `client/src/hooks/useDictation/useDictation.test.ts` | Remove preflight-related test setup and assertions |
| `client/src/hooks/useDictation/types.ts` | Remove preflight-related types and phases |
| `client/src/pages/DictationPage/DictationPage.tsx` | Use `useServicesStatus`, handle disabled/error states, remove preflight |
| `client/src/pages/DictationPage/DictationPage.test.tsx` | Update tests for new service status pattern |
| `client/src/pages/DictationPage/types.ts` | Remove `PreflightCheckProps` |
| `client/src/pages/DictationPage/hooks/useModelDownload.ts` | Replace `checkServices` callback with `refetch` from `useServicesStatus` |
| `client/src/pages/SettingsPage/SettingsPage.tsx` | Add `enable_dictation` toggle, remove test connection button, add inline service status, add `ServiceRestartModal` integration |
| `client/src/pages/SettingsPage/SettingsPage.test.tsx` | Remove test connection tests, add service restart modal tests |
| `client/src/pages/SettingsPage/hooks/useSettings.ts` | Add `needsServiceRestart` detection |
| `desktop/src/dictation.ts` | Make `handleDictationHotkey` async with deps parameter, add readiness and enabled checks via HTTP call |
| `desktop/src/main.ts` | Pass deps to `handleDictationHotkey` in F4 registration |
| `docs/configuration.md` | Add `enable_dictation` option, update dictation section, remove Test Connection reference |
| `docs/features/dictation.md` | Add enabling section, replace preflight checks with startup status page, update hotkey section |
| `server/README.md` | Add `GET /api/services/status`, remove `GET /api/dictation/status`, add services doc link |
| `server/docs/dictation.md` | Remove status endpoint section, add 503 errors to transcribe and process |

### Deleted Files

| File | Description |
|------|-------------|
| `client/src/pages/DictationPage/components/PreflightCheck.tsx` | Replaced by startup status page and `useServicesStatus` hook |

## Testing Strategy

### Complexity Assessment

Complex task: cross-module integration (server, client, desktop, shared), complex state management (service lifecycle, startup/restart flows), multiple failure modes (service start failures, config validation, race conditions). Using Levels 1 + 2 + 3: ATDD → BDD → TDD.

### Level 1: Acceptance Criteria (ATDD)

| # | Criterion | Verification |
|---|-----------|-------------|
| AC1 | When `enable_dictation` is false, no dictation services start on server startup | E2E: start app with `enable_dictation: false`, verify services/status shows both as `not_configured` |
| AC2 | When `enable_dictation` is true and a model exists, whisper starts eagerly on server startup | E2E: start app with `enable_dictation: true` and a model present, verify whisper reaches `running` |
| AC3 | When `enable_dictation` is true and `llm_cleanup` is true, ollama starts eagerly | E2E: verify ollama reaches `running` alongside whisper |
| AC4 | The startup status page shows per-service status and transitions to the app when ready | E2E: observe startup page checklist, verify app loads after services are ready |
| AC5 | Changing a service-affecting config field shows a confirmation modal and triggers a service restart on confirm | E2E: toggle `enable_dictation`, click save, confirm restart, verify startup status page appears |
| AC6 | F4 shows a notification when dictation is disabled | E2E: with `enable_dictation: false`, press F4, verify notification |
| AC7 | The dictation page shows "disabled" message when `enable_dictation` is false | E2E: navigate to dictation page, verify alert message |
| AC8 | Model download starts whisper without requiring a restart | E2E: enable dictation with no model, download a model, verify whisper starts |
| AC9 | `GET /api/services/status` has no side effects | Integration: call the endpoint repeatedly, verify no processes are spawned |
| AC10 | Transcribe and process routes return 503 when services are down | Integration: call endpoints with services stopped, verify 503 responses |

### Level 2: Behavioral Scenarios (BDD)

**Service Manager:**
- Given `enable_dictation` is true and a model exists, when the service manager starts, then whisper state transitions from `starting` to `running`
- Given `enable_dictation` is true and no model exists, when the service manager starts, then whisper state is `not_configured`
- Given `enable_dictation` is true and `llm_cleanup` is false, when the service manager starts, then ollama state is `not_configured`
- Given whisper fails to start, when the service manager starts, then whisper state is `error` with an error message
- Given whisper is in `error` state, when `getStatus()` is called, then `ready` is `true` (error is a terminal state)
- Given whisper is in `starting` state, when `getStatus()` is called, then `ready` is `false`
- Given a `start()` is in progress, when another `start()` is called, then the second call waits for the first to complete before proceeding
- Given services are running, when `stop()` is called, then both services are stopped
- Given whisper was running but the process crashed, when `getStatus()` is called, then whisper state transitions to `error`

**Service Restart Detection:**
- Given the current config has `enable_dictation: false`, when saving with `enable_dictation: true`, then `needsServiceRestart` returns true
- Given the current config has `dictation.ollama_model: "phi4-mini"`, when saving with the same model, then `needsServiceRestart` returns false
- Given a non-restart field changes (e.g., `dark_mode`), when saving, then `needsServiceRestart` returns false

**Route Fail-Fast:**
- Given whisper is not running, when `/api/dictation/transcribe` is called, then it returns 503
- Given ollama is not running and `llm_cleanup` is true, when `/api/dictation/process` is called, then it returns 503
- Given `llm_cleanup` is false, when `/api/dictation/process` is called, then ollama status is not checked

**Startup Status Page:**
- Given services are starting, when the page renders, then each service shows a spinner
- Given all services reach `running`, when the status is polled, then the page calls `onReady`
- Given whisper reaches `error` and ollama reaches `running`, when the status is polled, then `ready` is `true` and the page calls `onReady`
- Given no services are configured, when the page renders, then it calls `onReady` immediately
- Given services have been in `starting` for 30 seconds, when the timeout elapses, then a "Skip and continue" link appears
- Given the "Skip and continue" link is visible, when the user clicks it, then `onReady` is called

**Settings Page:**
- Given `enable_dictation` is false, when viewing settings, then dictation fields are disabled
- Given `enable_dictation` is false, when viewing settings, then `llm_cleanup` toggle is disabled
- Given a service-affecting field is changed, when clicking save, then the `ServiceRestartModal` appears
- Given the `ServiceRestartModal` is shown, when clicking cancel, then changes are not saved (but remain in the form)

**F4 Hotkey:**
- Given `enable_dictation` is false, when F4 is pressed, then a "disabled" notification is shown
- Given services are still starting, when F4 is pressed, then a "still starting" notification is shown
- Given the server is unreachable, when F4 is pressed, then a "cannot reach server" notification is shown
- Given services are ready, when F4 is pressed, then dictation starts normally

### Level 3: Unit Tests (TDD)

| Unit | What to test |
|------|-------------|
| `createServiceManager` | Calls correct start/stop deps based on config flags; `getStatus()` returns correct state; `getStatus()` detects crashed services via `checkOllamaHealth`/`isWhisperRunning`; `getStatus().ready` is `true` when all services are in terminal states (`running`/`error`/`not_configured`), `false` when any service is `starting`; `start()`/`stop()` are serialized (concurrent calls wait); `startWhisperIfReady()` only starts when all conditions met |
| `needsServiceRestart(old, new)` | All combinations of restart-requiring field changes, no false positives for non-restart fields |
| `validateBoolean("enable_dictation")` | Validates the new config field |
| `getServicesStatus` (client API) | Calls correct endpoint, returns typed response |
| `useSSE` hook | Creates EventSource on mount, dispatches parsed events to handlers, closes on unmount |
| `useServiceEvents` hook | Calls `onServicesRestarting` callback when `servicesRestarting` SSE event fires |
| `useServicesStatus` hook | Fetches on mount, returns loading/status/refetch; polls when `pollInterval` is set |
| `StartupPage` component | Renders correct status indicators per service state, calls `onReady` when ready, calls `onReady` when error (terminal state), shows "Skip and continue" link after 30 seconds |
| `ServiceRestartModal` component | Renders warning text, calls onConfirm/onCancel correctly |
| `useSettings.needsServiceRestart` | Compares local config against saved config for restart fields |
| Transcribe route | Returns 503 when whisper not running; succeeds when whisper running |
| Process route | Returns 503 when ollama not running and `llm_cleanup` true; skips ollama check when `llm_cleanup` false |

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Service manager start is async; server could receive requests before services are ready | Users see errors if they navigate before startup completes | Startup status page gates the entire UI until services have settled (reached terminal state) |
| Whisper or ollama binary not found on system | Service fails to start, user stuck | Service manager sets state to `error` with a descriptive message; `ready` still becomes `true` (error is a terminal state); app proceeds with degraded functionality |
| Rapid config saves race the restart (user saves twice quickly) | Interleaved stop/start calls leave services in unexpected state | Service manager serializes `start()` and `stop()` via an internal mutex; second restart waits for first to complete, then runs with the latest config |
| Service hangs in `starting` state (e.g., whisper binary hangs on startup) | User stuck on startup page indefinitely | Startup page shows a "Skip and continue" link after 30 seconds; `waitForWhisperReady` has its own retry limit (30 retries × 500ms = 15s) that transitions to `error` on timeout |
| SSE `servicesRestarting` event lost (connection drops before event is received) | Frontend doesn't show startup status page after service restart | Frontend can detect service unavailability when API calls fail and fall back to showing the startup status page |
| Config file corrupted during save | App fails to start with new config | Existing `atomicWriteFile` ensures config writes are atomic; `parseAndValidateConfig` falls back to defaults on invalid JSON |
| Model download completes but whisper fails to start | User expects dictation to work after download | `startWhisperIfReady` sets state to `error`; dictation page shows the error state via `useServicesStatus` |
| Service crashes after startup (ollama/whisper process exits) | Dictation requests fail silently | `getStatus()` checks liveness on each call and transitions state to `error`; routes return 503; dictation page shows error state |
| F4 HTTP call fails due to server being temporarily unreachable | User gets no feedback | Catch block shows "Cannot reach Weaver server" notification |

## Dependencies

- No external system or API dependencies beyond what already exists (whisper binary, ollama binary)
- No infrastructure changes required
- No team approvals needed (local developer tool)
- Cloudscape Design System components used: `StatusIndicator`, `SpaceBetween`, `Modal`, `Button`, `Alert`, `Toggle`, `Box`, `Spinner`
