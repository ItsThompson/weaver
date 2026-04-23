# Implementation Plan: Microphone Input Selection for Dictation

## OVERVIEW

### Description

Add a microphone input selection setting to the dictation feature. Users can choose which audio input device to use for dictation via a dropdown on both the Settings page and the Dictation page. The selection persists in `~/.weaver/config.json` and applies to both the Dictation page flow and the F4 hotkey flow.

### Success Criteria

- User can select a microphone from a dropdown of available audio input devices
- "System Default" option is always available and is the default
- Selection persists in `config.dictation.microphone_device_id`
- Both Dictation page and F4 hotkey flow use the selected device
- If a saved device is no longer available, dictation falls back to system default
- Dictation page shows a warning when the saved device is unavailable
- F4 hotkey flow falls back silently (no warning)
- Refresh button re-enumerates devices without page reload
- Duplicate device labels are disambiguated with the device ID

### Assumptions & Constraints

- `navigator.mediaDevices.enumerateDevices()` only returns labels after microphone permission has been granted at least once (this is already the case for dictation users)
- Device IDs can change across browser sessions or system restarts on some platforms; this is a known limitation of the Web Audio API
- Electron only: the mic selector is gated by `isElectron()` alongside the rest of the dictation UI

## APPROACH

### High-Level Solution Design

1. Add `microphone_device_id` field to `DictationConfig` (shared types + server validator)
2. Create a `useAudioDevices` hook that enumerates audio input devices with label formatting logic
3. Create a shared `MicrophoneSelector` component (Cloudscape Select + refresh button) used by both pages
4. Update `useAudioCapture.startRecording()` to accept an optional `deviceId`
5. Update `useDictation` to accept a `deviceId` parameter and track stale device state
6. Update `useHotkeyDictation` to read config and resolve the device silently
7. Wire the selector into the Dictation page (with stale device warning) and Settings page

### Key Architectural Decisions

- **Shared component, not shared hook for config writes**: The `MicrophoneSelector` component is purely presentational (dropdown + refresh). Each parent decides how to persist the selection: the Settings page updates local state (saved on "Save" click), the Dictation page calls `patchConfig` immediately.
- **`deviceId` passed as parameter to `useDictation`**: The DictationPage reads config via `useConfigQuery` and passes the device ID down. This keeps `useDictation` testable without mocking config.
- **`useHotkeyDictation` reads config internally**: It runs at the App level with no parent passing props, so it uses `useConfigQuery` directly.
- **Device resolution is a plain async function**: `resolveDeviceId(savedId)` enumerates devices and returns `{ deviceId, isStale }`. Used by both dictation flows.

### Development Workflow

**Assessed complexity: Moderate.** Multiple user flows (Dictation page, Settings page, F4 hotkey), touches several existing modules (useAudioCapture, useDictation, useHotkeyDictation, DictationPage, SettingsPage), conditional logic for device availability and label deduplication. No new external dependencies or complex algorithms.

**Levels: ATDD + BDD (Levels 1 + 2).**

## IMPLEMENTATION STEPS

---

### Step 1: Config Layer — Add `microphone_device_id`

**Workflow level**: ATDD (simple config addition following existing pattern)

**Description**: Add the `microphone_device_id` field to `DictationConfig`, `DEFAULT_CONFIG`, and the server-side config validator.

**Files to modify**:
- `shared/types/config.ts`: Add `microphone_device_id: string` to `DictationConfig`, add `microphone_device_id: ""` to `DEFAULT_CONFIG.dictation`
- `server/src/services/config/validators/field.ts`: Add `microphone_device_id` string validation to `validateDictation`, include it in the spread output
- `server/src/services/config/validators/field.test.ts`: Add tests for the new field

**Specific changes**:

`DictationConfig` becomes:
```typescript
export interface DictationConfig {
  ollama_url: string;
  ollama_model: string;
  llm_cleanup: boolean;
  microphone_device_id: string;
}
```

`DEFAULT_CONFIG.dictation` becomes:
```typescript
dictation: {
  ollama_url: "http://localhost:11434",
  ollama_model: "phi4-mini",
  llm_cleanup: true,
  microphone_device_id: "",
}
```

Validator addition in `validateDictation`: `microphone_device_id` must be a string if present. Empty string is valid (means system default). Missing key falls back to default (`""`).

**Acceptance criteria**:
- `DictationConfig` includes `microphone_device_id: string`
- `DEFAULT_CONFIG.dictation.microphone_device_id` is `""`
- Valid string values pass validation
- Non-string values produce a warning
- Missing key falls back to `""`
- `npm run build` passes, all existing tests pass, new validator tests pass

---

### Step 2: `useAudioDevices` Hook

**Workflow level**: BDD (Given-When-Then for enumeration and label logic)

**Description**: Create a hook that enumerates audio input devices, formats labels (handling duplicates and missing labels), and provides a refresh function.

**Files to create**:
- `client/src/hooks/useAudioDevices/useAudioDevices.ts`
- `client/src/hooks/useAudioDevices/useAudioDevices.test.ts`
- `client/src/hooks/useAudioDevices/index.ts`

**Hook signature**:
```typescript
interface AudioDevice {
  deviceId: string;
  label: string;
}

interface UseAudioDevicesResult {
  devices: AudioDevice[];
  loading: boolean;
  refresh: () => void;
}

export function useAudioDevices(): UseAudioDevicesResult
```

**Label formatting rules**:
1. Filter `enumerateDevices()` results to `kind === "audioinput"` and exclude `deviceId === "default"` (the browser's synthetic default entry)
2. If `device.label` is non-empty and unique among all audio input devices: use `label`
3. If `device.label` is non-empty but duplicated across devices: use `label (deviceId)` where deviceId is the first 8 characters
4. If `device.label` is empty: use `Unknown Device (deviceId)` where deviceId is the first 8 characters

**Behavior**:
- Enumerates on mount
- `refresh()` re-enumerates
- `loading` is true during enumeration

**BDD scenarios**:
- Given devices are available, when hook mounts, then devices are populated with formatted labels
- Given two devices have the same label, when hook mounts, then both labels include the short device ID
- Given a device has an empty label, when hook mounts, then it shows "Unknown Device (shortId)"
- Given user calls refresh, when new devices are available, then the list updates
- Given enumerateDevices is not available, when hook mounts, then devices is empty and loading is false

**Acceptance criteria**:
- Devices are enumerated on mount
- Labels follow the formatting rules above
- Refresh re-enumerates
- Graceful handling when `enumerateDevices` is unavailable
- All tests pass

---

### Step 3: `resolveDeviceId` Utility

**Workflow level**: BDD

**Description**: Create a pure async utility function that checks whether a saved device ID is still available and returns the resolved device ID plus a staleness flag.

**Files to create**:
- `client/src/hooks/useAudioDevices/resolveDeviceId.ts`
- `client/src/hooks/useAudioDevices/resolveDeviceId.test.ts`

**Function signature**:
```typescript
interface ResolvedDevice {
  deviceId: string | undefined;
  isStale: boolean;
}

export async function resolveDeviceId(savedId: string): Promise<ResolvedDevice>
```

**Logic**:
1. If `savedId` is empty: return `{ deviceId: undefined, isStale: false }` (system default)
2. Enumerate devices, filter to `audioinput`
3. If `savedId` is found in the list: return `{ deviceId: savedId, isStale: false }`
4. If not found: return `{ deviceId: undefined, isStale: true }`

**BDD scenarios**:
- Given savedId is empty, when resolved, then deviceId is undefined and isStale is false
- Given savedId matches an available device, when resolved, then deviceId is the savedId and isStale is false
- Given savedId does not match any device, when resolved, then deviceId is undefined and isStale is true
- Given enumerateDevices fails, when resolved, then deviceId is undefined and isStale is false (graceful fallback)

**Acceptance criteria**:
- All four scenarios pass
- Function is pure async (no side effects beyond the browser API call)
- All tests pass

---

### Step 4: `MicrophoneSelector` Shared Component

**Workflow level**: BDD (component behavior scenarios)

**Description**: Create a shared Cloudscape Select dropdown with a refresh button for microphone selection. Used by both Settings and Dictation pages.

**Files to create**:
- `client/src/components/MicrophoneSelector/MicrophoneSelector.tsx`
- `client/src/components/MicrophoneSelector/MicrophoneSelector.test.tsx`
- `client/src/components/MicrophoneSelector/index.ts`

**Component props**:
```typescript
interface MicrophoneSelectorProps {
  selectedDeviceId: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
}
```

**UI**:
- Cloudscape `Select` dropdown
- First option is always: `{ value: "", label: "System Default" }`
- Remaining options from `useAudioDevices` hook: `{ value: device.deviceId, label: device.label }`
- Refresh `Button` (icon: "refresh") next to the dropdown, calls `useAudioDevices().refresh`
- Wrapped in `SpaceBetween direction="horizontal"`

**BDD scenarios**:
- Given devices are available, when component renders, then dropdown shows "System Default" plus all devices
- Given selectedDeviceId is empty, when component renders, then "System Default" is selected
- Given selectedDeviceId matches a device, when component renders, then that device is selected
- Given user selects a different device, when onChange fires, then the new deviceId is passed to onChange
- Given user selects "System Default", when onChange fires, then empty string is passed to onChange
- Given user clicks refresh, when devices update, then dropdown options update
- Given disabled is true, when component renders, then dropdown and refresh button are disabled

**Acceptance criteria**:
- "System Default" is always the first option
- Selection changes call onChange with the correct deviceId
- Refresh button re-enumerates devices
- Disabled state works
- All tests pass

---

### Step 5: Update `useAudioCapture` — Accept `deviceId`

**Workflow level**: ATDD (minimal change to existing hook)

**Description**: Update `startRecording` to accept an optional `deviceId` parameter and pass it as a constraint to `getUserMedia`.

**Files to modify**:
- `client/src/hooks/useAudioCapture/useAudioCapture.ts`

**Specific change**:

`startRecording` signature changes from:
```typescript
const startRecording = useCallback(async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: TARGET_SAMPLE_RATE, channelCount: 1 },
  });
```

To:
```typescript
const startRecording = useCallback(async (deviceId?: string) => {
  const audioConstraints: MediaTrackConstraints = {
    sampleRate: TARGET_SAMPLE_RATE,
    channelCount: 1,
  };
  if (deviceId) {
    audioConstraints.deviceId = { exact: deviceId };
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
  });
```

**Acceptance criteria**:
- When `deviceId` is omitted or empty, behavior is unchanged (system default)
- When `deviceId` is provided, `getUserMedia` is called with `{ exact: deviceId }`
- Existing tests still pass
- `npm run build` passes

---

### Step 6: Update `useDictation` — Device ID and Stale Warning

**Workflow level**: BDD

**Description**: Update `useDictation` to accept a `deviceId` parameter, resolve it before starting, and expose a stale device warning in state.

**Files to modify**:
- `client/src/hooks/useDictation/useDictation.ts`: Accept `deviceId` param, call `resolveDeviceId` in `startDictation`, pass resolved ID to `audio.startRecording`
- `client/src/hooks/useDictation/types.ts`: Add `deviceWarning: string | null` to `DictationState`
- `client/src/hooks/useDictation/useDictation.test.ts`: Add tests for device resolution

**Changes to `useDictation`**:

Signature changes to:
```typescript
export function useDictation(deviceId?: string): { state: DictationState; actions: DictationActions }
```

In `startDictation`:
```typescript
const startDictation = useCallback(async () => {
  // ... existing reset logic ...
  try {
    const resolved = await resolveDeviceId(deviceId ?? "");
    if (resolved.isStale) {
      setState((s) => ({
        ...s,
        deviceWarning: "Previously selected microphone is no longer available. Using system default.",
      }));
    }
    await audio.startRecording(resolved.deviceId);
    // ... existing recording logic ...
  } catch (err) {
    // ... existing error handling ...
  }
}, [audio, deviceId]);
```

Add `deviceWarning: null` to `INITIAL_STATE`. Clear it on `reset`.

**BDD scenarios**:
- Given deviceId is empty, when startDictation is called, then no warning and system default is used
- Given deviceId matches an available device, when startDictation is called, then that device is used and no warning
- Given deviceId does not match any device, when startDictation is called, then system default is used and deviceWarning is set
- Given deviceWarning is set, when reset is called, then deviceWarning is cleared

**Acceptance criteria**:
- Device resolution happens before audio capture starts
- Stale device produces a warning in state
- Available device is passed through to startRecording
- All existing tests still pass, new tests pass

---

### Step 7: Update `useHotkeyDictation` — Read Config and Resolve Device

**Workflow level**: BDD

**Description**: Update `useHotkeyDictation` to read `microphone_device_id` from config and resolve it silently before starting audio capture.

**Files to modify**:
- `client/src/hooks/useHotkeyDictation/useHotkeyDictation.ts`: Import `useConfigQuery`, read `microphone_device_id`, call `resolveDeviceId` before `startRecording`
- `client/src/hooks/useHotkeyDictation/useHotkeyDictation.test.ts`: Add test for device resolution

**Changes to `useHotkeyDictation`**:

Add config read:
```typescript
const { data } = useConfigQuery();
const savedDeviceId = data?.config?.dictation?.microphone_device_id ?? "";
```

In the `start` command handler, resolve before recording:
```typescript
if (command === "start") {
  transcriptRef.current = "";
  pendingRef.current = Promise.resolve();
  setPhase("recording");
  playNotificationSound("dictation-start");
  const resolved = await resolveDeviceId(savedDeviceId);
  audioRef.current.startRecording(resolved.deviceId);
}
```

The `onDictationCommand` callback needs to become async. Since `ipcRenderer.on` callbacks can be async without issue, this is safe.

**BDD scenarios**:
- Given config has a valid device ID, when F4 start fires, then that device is used for recording
- Given config has a stale device ID, when F4 start fires, then system default is used silently (no warning)
- Given config has no device ID, when F4 start fires, then system default is used

**Acceptance criteria**:
- Config is read via `useConfigQuery`
- Device is resolved before starting audio capture
- No warning is surfaced (silent fallback)
- All existing tests still pass, new tests pass

---

### Step 8: Wire into Dictation Page

**Workflow level**: BDD

**Description**: Add the `MicrophoneSelector` to the Dictation page between PreflightCheck and DictationControls. Show a warning Alert when the saved device is stale. Read config and pass `deviceId` to `useDictation`. Persist mic changes immediately via `patchConfig`.

**Files to modify**:
- `client/src/pages/DictationPage/DictationPage.tsx`: Import `MicrophoneSelector`, `useConfigQuery`, `patchConfig`, `revalidateConfig`. Read config, pass `deviceId` to `useDictation`. Render selector and stale warning.
- `client/src/pages/DictationPage/DictationPage.test.tsx`: Add tests for mic selector and stale warning

**UI placement** (between PreflightCheck and DictationControls):
```
<PreflightCheck ... />
<MicrophoneSelector
  selectedDeviceId={config.dictation.microphone_device_id}
  onChange={handleMicChange}
  disabled={isRecordingOrProcessing || hotkeyActive}
/>
{state.deviceWarning && <Alert type="warning">{state.deviceWarning}</Alert>}
<DictationControls ... />
```

**`handleMicChange` handler**:
```typescript
const handleMicChange = async (deviceId: string) => {
  await patchConfig({ dictation: { ...config.dictation, microphone_device_id: deviceId } });
  await revalidateConfig();
};
```

The selector is disabled during recording, processing, or when the hotkey is active.

**BDD scenarios**:
- Given page loads with config, when MicrophoneSelector renders, then it shows the saved device
- Given user selects a new device, when onChange fires, then config is patched and revalidated
- Given saved device is stale, when dictation starts, then warning Alert appears
- Given selector is present, when recording is active, then selector is disabled
- Given hotkey is active, when page renders, then selector is disabled

**Acceptance criteria**:
- MicrophoneSelector renders between PreflightCheck and controls
- Device changes persist immediately via patchConfig
- Stale device warning appears as an Alert
- Selector is disabled during recording/processing/hotkey
- All existing tests still pass, new tests pass

---

### Step 9: Wire into Settings Page

**Workflow level**: ATDD

**Description**: Add the `MicrophoneSelector` to the Settings page Dictation section. Selection updates local config state (persisted on Save click, same as other settings).

**Files to modify**:
- `client/src/pages/SettingsPage/SettingsPage.tsx`: Import `MicrophoneSelector`, render it in the Dictation section with a `FormField` wrapper
- `client/src/pages/SettingsPage/SettingsPage.test.tsx`: Add test for mic selector presence and save behavior

**UI placement** (in the Dictation section, after the "Dictation" header, before "LLM Cleanup"):
```
<FormField
  label="Microphone"
  description="Select which microphone to use for dictation"
>
  <MicrophoneSelector
    selectedDeviceId={config.dictation.microphone_device_id}
    onChange={(deviceId) =>
      setConfig((prev) => ({
        ...prev,
        dictation: { ...prev.dictation, microphone_device_id: deviceId },
      }))
    }
    disabled={hasWarnings}
  />
</FormField>
```

**Acceptance criteria**:
- Microphone selector appears in the Dictation section (Electron only)
- Selection updates local config state
- Saving persists the selected device ID
- Selector is disabled when config has warnings
- All existing tests still pass, new tests pass

---

## FILES TO MODIFY/CREATE

### New Files

| File | Step | Description |
|------|------|-------------|
| `client/src/hooks/useAudioDevices/useAudioDevices.ts` | 2 | Audio input device enumeration hook |
| `client/src/hooks/useAudioDevices/useAudioDevices.test.ts` | 2 | Hook tests |
| `client/src/hooks/useAudioDevices/resolveDeviceId.ts` | 3 | Device availability check utility |
| `client/src/hooks/useAudioDevices/resolveDeviceId.test.ts` | 3 | Utility tests |
| `client/src/hooks/useAudioDevices/index.ts` | 2 | Barrel export |
| `client/src/components/MicrophoneSelector/MicrophoneSelector.tsx` | 4 | Shared mic selector component |
| `client/src/components/MicrophoneSelector/MicrophoneSelector.test.tsx` | 4 | Component tests |
| `client/src/components/MicrophoneSelector/index.ts` | 4 | Barrel export |

### Modified Files

| File | Step | Description |
|------|------|-------------|
| `shared/types/config.ts` | 1 | Add `microphone_device_id` to `DictationConfig` and `DEFAULT_CONFIG` |
| `server/src/services/config/validators/field.ts` | 1 | Add `microphone_device_id` validation to `validateDictation` |
| `server/src/services/config/validators/field.test.ts` | 1 | Add validator tests |
| `client/src/hooks/useAudioCapture/useAudioCapture.ts` | 5 | `startRecording` accepts optional `deviceId` |
| `client/src/hooks/useDictation/useDictation.ts` | 6 | Accept `deviceId` param, resolve before recording, expose warning |
| `client/src/hooks/useDictation/types.ts` | 6 | Add `deviceWarning` to `DictationState` |
| `client/src/hooks/useDictation/useDictation.test.ts` | 6 | Add device resolution tests |
| `client/src/hooks/useHotkeyDictation/useHotkeyDictation.ts` | 7 | Read config, resolve device silently |
| `client/src/hooks/useHotkeyDictation/useHotkeyDictation.test.ts` | 7 | Add device resolution test |
| `client/src/pages/DictationPage/DictationPage.tsx` | 8 | Render MicrophoneSelector + stale warning, read config, pass deviceId |
| `client/src/pages/DictationPage/DictationPage.test.tsx` | 8 | Add mic selector and warning tests |
| `client/src/pages/SettingsPage/SettingsPage.tsx` | 9 | Render MicrophoneSelector in Dictation section |
| `client/src/pages/SettingsPage/SettingsPage.test.tsx` | 9 | Add mic selector tests |

## TESTING STRATEGY

### Development Workflow Level: Moderate (ATDD + BDD)

### Level 1: Acceptance Criteria (ATDD)

AC1: Given the user opens the Dictation page, when devices are available, then a microphone dropdown appears with "System Default" as the first option followed by available devices.

AC2: Given the user selects a microphone on the Dictation page, when the selection changes, then `config.dictation.microphone_device_id` is updated in `~/.weaver/config.json` immediately.

AC3: Given the user selects a microphone on the Settings page, when they click Save, then `config.dictation.microphone_device_id` is persisted.

AC4: Given a device is selected and the user starts dictation, when recording begins, then audio is captured from the selected device.

AC5: Given a saved device is no longer connected, when the user starts dictation on the Dictation page, then dictation uses the system default and a warning Alert appears: "Previously selected microphone is no longer available. Using system default."

AC6: Given a saved device is no longer connected, when F4 hotkey starts dictation, then dictation uses the system default silently (no warning).

AC7: Given no device is selected (system default), when dictation starts, then the OS default microphone is used with no warning.

AC8: Given the user clicks the refresh button next to the dropdown, when a new device has been plugged in, then the dropdown updates to include the new device.

AC9: Given two devices have identical labels, when the dropdown renders, then both entries include a short device ID to disambiguate.

AC10: Given the user is in the web version (not Electron), when they view the Settings page, then no microphone selector is visible.

AC11: Given dictation is recording, when the user views the mic selector, then it is disabled.

### Level 2: Behavioral Scenarios (BDD)

Scenarios are defined inline within each step above. Key scenario groups:
- Device enumeration and label formatting (Step 2)
- Device resolution and staleness detection (Step 3)
- MicrophoneSelector component behavior (Step 4)
- useDictation device warning flow (Step 6)
- useHotkeyDictation silent fallback (Step 7)
- DictationPage integration (Step 8)

## RISKS & MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Device IDs change across sessions | Medium | Low | User re-selects from dropdown. Stale detection + warning guides them. |
| `enumerateDevices` returns empty labels before permission grant | Low | Low | Dictation requires mic permission first. Label fallback shows device ID. |
| `{ exact: deviceId }` fails if device disconnects mid-session | Low | Medium | `getUserMedia` throws, caught by existing error handling in `startDictation`. |
| Config race condition: Dictation page patches config while Settings page has unsaved changes | Low | Low | Unlikely user flow. Config revalidation keeps both pages in sync. |

### Rollback Strategy

- Feature is additive: new config field has a default (`""`) that preserves existing behavior
- Removing the UI components and reverting the `startRecording` signature restores the original state
- No data migration needed: empty `microphone_device_id` means system default

## DEPENDENCIES

### External Systems

None. This feature uses only browser APIs (`navigator.mediaDevices.enumerateDevices`, `getUserMedia` constraints) that are already available in the Electron renderer.

### Infrastructure Changes

None. Only a new field in `~/.weaver/config.json` which is backward-compatible (missing field falls back to default).
