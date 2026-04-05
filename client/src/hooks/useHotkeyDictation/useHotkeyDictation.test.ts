import { renderHook, act } from "@testing-library/react";

import "../../__tests__/mocks/api";

const mockResolveDeviceId = vi.fn();
vi.mock("../useAudioDevices", () => ({
  resolveDeviceId: (...args: unknown[]) => mockResolveDeviceId(...args),
}));

let mockConfigData:
  | { config: { dictation: { microphone_device_id: string } } }
  | undefined;
vi.mock("../queries", () => ({
  useConfigQuery: () => ({ data: mockConfigData }),
}));

import * as api from "../../utils/api";
import * as soundUtils from "../notifications/soundUtils";
import { useHotkeyDictation } from "./useHotkeyDictation";

const mockTranscribeAudio = vi.mocked(api.transcribeAudio);
const mockProcessTranscript = vi.mocked(api.processTranscript);
const mockGetSnippets = vi.mocked(api.getSnippets);

vi.spyOn(soundUtils, "playNotificationSound").mockImplementation(() => {});
const mockPlaySound = vi.mocked(soundUtils.playNotificationSound);

let chunkCallback: ((blob: Blob) => void) | null = null;
let mockIsRecording = false;
const mockStartRecording = vi.fn(() => {
  mockIsRecording = true;
});
const mockStopRecording = vi.fn(() => {
  mockIsRecording = false;
});

vi.mock("../useAudioCapture", () => ({
  useAudioCapture: () => ({
    get isRecording() {
      return mockIsRecording;
    },
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    onChunk: (cb: (blob: Blob) => void) => {
      chunkCallback = cb;
    },
  }),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

let commandCallback: ((event: unknown, command: string) => void) | null = null;

const mockWeaver = {
  resizeMini: vi.fn(),
  selectDirectory: vi.fn(),
  startDictation: vi.fn(),
  stopDictation: vi.fn(),
  onDictationCommand: (cb: (event: unknown, command: string) => void) => {
    commandCallback = cb;
  },
  copyToClipboard: vi.fn(),
  showNotification: vi.fn(),
  sendDictationComplete: vi.fn(),
  sendDictationError: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  chunkCallback = null;
  commandCallback = null;
  mockIsRecording = false;
  mockConfigData = undefined;
  mockResolveDeviceId.mockResolvedValue({
    deviceId: undefined,
    isStale: false,
  });
  window.weaver = mockWeaver;
});

afterEach(() => {
  delete window.weaver;
});

describe("useHotkeyDictation", () => {
  it("starts inactive", () => {
    const { result } = renderHook(() => useHotkeyDictation());
    expect(result.current.active).toBe(false);
  });

  it("plays start sound and begins recording on start command", async () => {
    const { result } = renderHook(() => useHotkeyDictation());

    await act(async () => {
      commandCallback!(null, "start");
      await vi.waitFor(() => {
        expect(mockStartRecording).toHaveBeenCalled();
      });
    });

    expect(result.current.active).toBe(true);
    expect(mockPlaySound).toHaveBeenCalledWith("dictation-start");
    expect(mockStartRecording).toHaveBeenCalled();
  });

  it("plays stop sound and stops recording on stop command", () => {
    const { result } = renderHook(() => useHotkeyDictation());

    act(() => {
      commandCallback!(null, "start");
    });

    act(() => {
      commandCallback!(null, "stop");
    });

    expect(mockPlaySound).toHaveBeenCalledWith("dictation-stop");
    expect(mockStopRecording).toHaveBeenCalled();
  });

  it("sends processed text to main process and plays done sound on success", async () => {
    mockTranscribeAudio.mockResolvedValue({ text: "hello world" });
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    mockProcessTranscript.mockResolvedValue({
      processedText: "Hello, world.",
      snippetUsed: null,
    });

    const { result } = renderHook(() => useHotkeyDictation());

    act(() => {
      commandCallback!(null, "start");
    });

    await act(async () => {
      chunkCallback!(new Blob(["audio"]));
      await flush();
    });

    await act(async () => {
      commandCallback!(null, "stop");
      await flush();
    });

    await vi.waitFor(() => {
      expect(mockWeaver.sendDictationComplete).toHaveBeenCalledWith(
        "Hello, world.",
      );
    });

    expect(mockPlaySound).toHaveBeenCalledWith("dictation-done");
    expect(result.current.active).toBe(false);
  });

  it("sends error to main process when processing fails", async () => {
    mockTranscribeAudio.mockResolvedValue({ text: "hello" });
    mockGetSnippets.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useHotkeyDictation());

    act(() => {
      commandCallback!(null, "start");
    });

    await act(async () => {
      chunkCallback!(new Blob(["audio"]));
      await flush();
    });

    await act(async () => {
      commandCallback!(null, "stop");
      await flush();
    });

    await vi.waitFor(() => {
      expect(mockWeaver.sendDictationError).toHaveBeenCalledWith(
        "Network error",
      );
    });

    expect(result.current.active).toBe(false);
  });

  it("does not register listener when not in Electron", () => {
    delete window.weaver;

    const { result } = renderHook(() => useHotkeyDictation());

    expect(result.current.active).toBe(false);
    expect(commandCallback).toBeNull();
  });

  it("resolves saved device ID from config before recording", async () => {
    mockConfigData = {
      config: { dictation: { microphone_device_id: "mic-1" } },
    };
    mockResolveDeviceId.mockResolvedValue({
      deviceId: "mic-1",
      isStale: false,
    });

    renderHook(() => useHotkeyDictation());

    await act(async () => {
      commandCallback!(null, "start");
      await vi.waitFor(() => {
        expect(mockStartRecording).toHaveBeenCalled();
      });
    });

    expect(mockResolveDeviceId).toHaveBeenCalledWith("mic-1");
    expect(mockStartRecording).toHaveBeenCalledWith("mic-1");
  });

  it("falls back silently when saved device is stale", async () => {
    mockConfigData = {
      config: { dictation: { microphone_device_id: "gone-device" } },
    };
    mockResolveDeviceId.mockResolvedValue({
      deviceId: undefined,
      isStale: true,
    });

    renderHook(() => useHotkeyDictation());

    await act(async () => {
      commandCallback!(null, "start");
      await vi.waitFor(() => {
        expect(mockStartRecording).toHaveBeenCalled();
      });
    });

    expect(mockStartRecording).toHaveBeenCalledWith(undefined);
    // No error sent: silent fallback
    expect(mockWeaver.sendDictationError).not.toHaveBeenCalled();
  });

  it("sends error when startRecording fails after device resolution", async () => {
    mockResolveDeviceId.mockRejectedValue(new Error("Permission denied"));

    const { result } = renderHook(() => useHotkeyDictation());

    await act(async () => {
      commandCallback!(null, "start");
      await vi.waitFor(() => {
        expect(mockWeaver.sendDictationError).toHaveBeenCalled();
      });
    });

    expect(mockWeaver.sendDictationError).toHaveBeenCalledWith(
      "Microphone access failed",
    );
    expect(result.current.active).toBe(false);
  });
});
