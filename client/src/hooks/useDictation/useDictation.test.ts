import { renderHook, act } from "@testing-library/react";

import "../../__tests__/mocks/api";

vi.mock("../notifications/soundUtils", () => ({
  playNotificationSound: vi.fn(),
}));

const mockResolveDeviceId = vi.fn();
vi.mock("../useAudioDevices", () => ({
  resolveDeviceId: (...args: unknown[]) => mockResolveDeviceId(...args),
}));

import * as api from "../../utils/api";
import { useDictation } from "./useDictation";

const mockGetDictationStatus = vi.mocked(api.getDictationStatus);
const mockTranscribeAudio = vi.mocked(api.transcribeAudio);
const mockProcessTranscript = vi.mocked(api.processTranscript);
const mockGetSnippets = vi.mocked(api.getSnippets);

let chunkCallback: ((blob: Blob) => void) | null = null;
let mockIsRecording = false;
const mockStartRecording = vi.fn(async () => {
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

beforeEach(() => {
  vi.clearAllMocks();
  chunkCallback = null;
  mockIsRecording = false;
  mockResolveDeviceId.mockResolvedValue({
    deviceId: undefined,
    isStale: false,
  });
});

describe("useDictation", () => {
  it("starts in idle phase", () => {
    const { result } = renderHook(() => useDictation());
    expect(result.current.state.phase).toBe("idle");
  });

  it("transitions to ready when services are healthy", async () => {
    mockGetDictationStatus.mockResolvedValue({
      whisper: true,
      ollama: true,
      ollamaError: null,
      ollamaModel: "phi4-mini",
      model: "/path/to/model.bin",
    });

    const { result } = renderHook(() => useDictation());

    await act(async () => {
      await result.current.actions.checkServices();
    });

    expect(result.current.state.phase).toBe("ready");
    expect(result.current.state.whisperStatus).toBe(true);
    expect(result.current.state.ollamaStatus).toBe(true);
    expect(result.current.state.error).toBeNull();
  });

  it("transitions to error when ollama is down", async () => {
    mockGetDictationStatus.mockResolvedValue({
      whisper: false,
      ollama: false,
      ollamaError: "not_installed",
      ollamaModel: "phi4-mini",
      model: "/path/to/model.bin",
    });

    const { result } = renderHook(() => useDictation());

    await act(async () => {
      await result.current.actions.checkServices();
    });

    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error).toBe("Ollama is not available");
  });

  it("transitions to error when no whisper model is available", async () => {
    mockGetDictationStatus.mockResolvedValue({
      whisper: false,
      ollama: true,
      ollamaError: null,
      ollamaModel: "phi4-mini",
      model: null,
    });

    const { result } = renderHook(() => useDictation());

    await act(async () => {
      await result.current.actions.checkServices();
    });

    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error).toBe("No whisper model downloaded");
  });

  it("transitions to recording and starts audio capture", async () => {
    const { result } = renderHook(() => useDictation());

    await act(async () => {
      await result.current.actions.startDictation();
    });

    expect(result.current.state.phase).toBe("recording");
    expect(mockStartRecording).toHaveBeenCalled();
  });

  it("accumulates rawTranscript as chunks arrive", async () => {
    mockTranscribeAudio.mockResolvedValueOnce({ text: "hello " });
    mockTranscribeAudio.mockResolvedValueOnce({ text: "world" });

    const { result } = renderHook(() => useDictation());

    await act(async () => {
      await result.current.actions.startDictation();
    });

    await act(async () => {
      chunkCallback!(new Blob(["audio1"]));
      await flush();
    });

    expect(result.current.state.rawTranscript).toBe("hello ");

    await act(async () => {
      chunkCallback!(new Blob(["audio2"]));
      await flush();
    });

    expect(result.current.state.rawTranscript).toBe("hello world");
  });

  it("transitions to processing then done after stopDictation", async () => {
    mockTranscribeAudio.mockResolvedValue({ text: "hello world" });
    mockGetSnippets.mockResolvedValue({ snippets: [] });
    mockProcessTranscript.mockResolvedValue({
      processedText: "Hello, world.",
      snippetUsed: null,
    });

    const { result } = renderHook(() => useDictation());

    await act(async () => {
      await result.current.actions.startDictation();
    });

    await act(async () => {
      chunkCallback!(new Blob(["audio"]));
      await flush();
    });

    expect(result.current.state.rawTranscript).toBe("hello world");

    await act(async () => {
      result.current.actions.stopDictation();
      await flush();
    });

    await vi.waitFor(() => {
      expect(result.current.state.phase).toBe("done");
    });

    expect(result.current.state.processedText).toBe("Hello, world.");
    expect(mockProcessTranscript).toHaveBeenCalledWith("hello world", []);
  });

  it("sets hotkeyActive when dictation command is received", () => {
    let capturedCallback: ((event: unknown, command: string) => void) | null =
      null;
    window.weaver = {
      resizeMini: vi.fn(),
      selectDirectory: vi.fn(),
      startDictation: vi.fn(),
      stopDictation: vi.fn(),
      onDictationCommand: (cb) => {
        capturedCallback = cb;
      },
      copyToClipboard: vi.fn(),
      showNotification: vi.fn(),
    };

    const { result } = renderHook(() => useDictation());

    act(() => {
      capturedCallback!(null, "start");
    });

    expect(result.current.state.hotkeyActive).toBe(true);

    delete window.weaver;
  });

  it("reset returns to idle state", async () => {
    mockGetDictationStatus.mockResolvedValue({
      whisper: true,
      ollama: true,
      ollamaError: null,
      ollamaModel: "phi4-mini",
      model: "/path/to/model.bin",
    });

    const { result } = renderHook(() => useDictation());

    await act(async () => {
      await result.current.actions.checkServices();
    });
    expect(result.current.state.phase).toBe("ready");

    act(() => {
      result.current.actions.reset();
    });

    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.rawTranscript).toBe("");
    expect(result.current.state.processedText).toBe("");
  });

  it("passes resolved deviceId to startRecording", async () => {
    mockResolveDeviceId.mockResolvedValue({
      deviceId: "mic-1",
      isStale: false,
    });

    const { result } = renderHook(() => useDictation("mic-1"));

    await act(async () => {
      await result.current.actions.startDictation();
    });

    expect(mockResolveDeviceId).toHaveBeenCalledWith("mic-1");
    expect(mockStartRecording).toHaveBeenCalledWith("mic-1");
    expect(result.current.state.deviceWarning).toBeNull();
  });

  it("uses system default when deviceId is undefined", async () => {
    const { result } = renderHook(() => useDictation());

    await act(async () => {
      await result.current.actions.startDictation();
    });

    expect(mockResolveDeviceId).toHaveBeenCalledWith("");
    expect(mockStartRecording).toHaveBeenCalledWith(undefined);
  });

  it("sets deviceWarning when saved device is stale", async () => {
    mockResolveDeviceId.mockResolvedValue({
      deviceId: undefined,
      isStale: true,
    });

    const { result } = renderHook(() => useDictation("gone-device"));

    await act(async () => {
      await result.current.actions.startDictation();
    });

    expect(result.current.state.deviceWarning).toBe(
      "Previously selected microphone is no longer available. Using system default.",
    );
    expect(mockStartRecording).toHaveBeenCalledWith(undefined);
  });

  it("clears deviceWarning on reset", async () => {
    mockResolveDeviceId.mockResolvedValue({
      deviceId: undefined,
      isStale: true,
    });

    const { result } = renderHook(() => useDictation("gone-device"));

    await act(async () => {
      await result.current.actions.startDictation();
    });

    expect(result.current.state.deviceWarning).not.toBeNull();

    act(() => {
      result.current.actions.reset();
    });

    expect(result.current.state.deviceWarning).toBeNull();
  });
});
