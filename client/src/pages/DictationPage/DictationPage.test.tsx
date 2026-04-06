import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import type {
  DictationState,
  DictationActions,
} from "../../hooks/useDictation";
import { DictationPage } from "./DictationPage";

const mockAddNotification = vi.fn();

vi.mock("../../context/NotificationContext/NotificationContext", () => ({
  useNotifications: () => ({
    notifications: [],
    addNotification: mockAddNotification,
    dismissNotification: vi.fn(),
  }),
}));

let mockHotkeyActive = false;

vi.mock("../../hooks/useHotkeyDictation", () => ({
  useHotkeyDictationActive: () => mockHotkeyActive,
}));

const mockPatchConfig = vi.fn().mockResolvedValue({});
const mockRevalidateConfig = vi.fn();

vi.mock("../../utils/api", () => ({
  patchConfig: (...args: unknown[]) => mockPatchConfig(...args),
}));

vi.mock("../../hooks/queries", () => ({
  useConfigQuery: () => ({
    data: { config: DEFAULT_CONFIG, warnings: [] },
  }),
  revalidateConfig: () => mockRevalidateConfig(),
}));

let mockDevices: { deviceId: string; label: string }[] = [];
let mockDevicesLoading = false;
const mockRefresh = vi.fn();

vi.mock("../../hooks/useAudioDevices", () => ({
  useAudioDevices: () => ({
    get devices() {
      return mockDevices;
    },
    get loading() {
      return mockDevicesLoading;
    },
    refresh: mockRefresh,
  }),
}));

const mockActions: DictationActions = {
  checkServices: vi.fn(),
  startDictation: vi.fn(),
  stopDictation: vi.fn(),
  copyToClipboard: vi.fn(),
  reset: vi.fn(),
};

let mockState: DictationState;

vi.mock("../../hooks/useDictation", () => ({
  useDictation: () => ({ state: mockState, actions: mockActions }),
}));

vi.mock("./components/ModelDownload", () => ({
  ModelDownload: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="model-download">
      <button onClick={onComplete}>mock-complete</button>
    </div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <DictationPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHotkeyActive = false;
  mockDevices = [{ deviceId: "mic-1", label: "USB Microphone" }];
  mockDevicesLoading = false;
  mockState = {
    phase: "idle",
    rawTranscript: "",
    processedText: "",
    error: null,
    deviceWarning: null,
    whisperStatus: false,
    ollamaStatus: false,
    ollamaError: null,
    ollamaModel: "phi4-mini",
    hasModel: false,
    hotkeyActive: false,
  };
});

describe("DictationPage", () => {
  it("calls checkServices on mount", () => {
    renderPage();
    expect(mockActions.checkServices).toHaveBeenCalled();
  });

  it("shows enabled Start button and green indicators when services are healthy", () => {
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    expect(screen.getByText("Dictation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start Dictation" }),
    ).not.toBeDisabled();
    expect(screen.getByText("Whisper")).toBeInTheDocument();
    expect(screen.getByText("Ollama")).toBeInTheDocument();
  });

  it("shows ModelDownload when whisper has no model", () => {
    mockState = {
      ...mockState,
      phase: "error",
      whisperStatus: false,
      ollamaStatus: true,
      error: "No whisper model downloaded",
    };
    renderPage();

    expect(screen.getByTestId("model-download")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start Dictation" }),
    ).not.toBeInTheDocument();
  });

  it("calls checkServices when ModelDownload completes", async () => {
    const user = userEvent.setup();
    mockState = {
      ...mockState,
      phase: "error",
      whisperStatus: false,
      ollamaStatus: true,
      error: "No whisper model downloaded",
    };
    renderPage();

    await user.click(screen.getByText("mock-complete"));
    expect(mockActions.checkServices).toHaveBeenCalledTimes(2); // once on mount, once on complete
  });

  it("shows raw transcript and Stop button during recording", () => {
    mockState = {
      ...mockState,
      phase: "recording",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
      rawTranscript: "hello world",
    };
    renderPage();

    expect(
      screen.getByRole("button", { name: "Stop Dictation" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("hello world")).toBeInTheDocument();
  });

  it("shows Processing indicator during processing phase", () => {
    mockState = {
      ...mockState,
      phase: "processing",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
      rawTranscript: "hello world",
    };
    renderPage();

    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it("shows processed output when phase is done", () => {
    mockState = {
      ...mockState,
      phase: "done",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
      rawTranscript: "hello world",
      processedText: "Hello, world.",
    };
    renderPage();

    expect(screen.getByDisplayValue("Hello, world.")).toBeInTheDocument();
  });

  it("disables controls and shows info Alert when hotkey is active", () => {
    mockHotkeyActive = true;
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    expect(
      screen.getByText(
        "Dictation in progress via hotkey. Controls are disabled.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start Dictation" }),
    ).toBeDisabled();
  });

  it("calls copyToClipboard when Copy button is clicked", async () => {
    const user = userEvent.setup();
    mockState = {
      ...mockState,
      phase: "done",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
      processedText: "Hello, world.",
    };
    renderPage();

    await user.click(screen.getByRole("button", { name: "Copy to Clipboard" }));
    expect(mockActions.copyToClipboard).toHaveBeenCalled();
  });

  it("calls startDictation when Start button is clicked", async () => {
    const user = userEvent.setup();
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    await user.click(screen.getByRole("button", { name: "Start Dictation" }));
    expect(mockActions.startDictation).toHaveBeenCalled();
  });

  it("calls stopDictation when Stop button is clicked", async () => {
    const user = userEvent.setup();
    mockState = {
      ...mockState,
      phase: "recording",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    await user.click(screen.getByRole("button", { name: "Stop Dictation" }));
    expect(mockActions.stopDictation).toHaveBeenCalled();
  });

  it("shows install guidance when Ollama is not installed", () => {
    mockState = {
      ...mockState,
      phase: "error",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: false,
      ollamaError: "not_installed",
      error: "Ollama is not available",
    };
    renderPage();

    expect(screen.getAllByText(/brew install ollama/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("ollama.com")).toBeInTheDocument();
  });

  it("shows model pull guidance when model is not found", () => {
    mockState = {
      ...mockState,
      phase: "error",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: false,
      ollamaError: "model_not_found",
      ollamaModel: "phi4-mini",
      error: "Ollama is not available",
    };
    renderPage();

    expect(screen.getAllByText(/ollama pull phi4-mini/).length).toBeGreaterThan(
      0,
    );
  });

  it("renders MicrophoneSelector with System Default selected", () => {
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    expect(screen.getByText("System Default")).toBeInTheDocument();
  });

  it("shows device warning alert when saved device is stale", () => {
    mockState = {
      ...mockState,
      phase: "recording",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
      deviceWarning:
        "Previously selected microphone is no longer available. Using system default.",
    };
    renderPage();

    expect(
      screen.getByText(
        "Previously selected microphone is no longer available. Using system default.",
      ),
    ).toBeInTheDocument();
  });

  it("shows microphone status in preflight check", () => {
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    expect(screen.getByText("Microphone: System Default")).toBeInTheDocument();
  });

  it("disables mic selector during recording", () => {
    mockState = {
      ...mockState,
      phase: "recording",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    expect(
      screen.getByRole("button", { name: "Refresh devices" }),
    ).toHaveAttribute("disabled");
  });

  it("disables mic selector when hotkey is active", () => {
    mockHotkeyActive = true;
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    expect(
      screen.getByRole("button", { name: "Refresh devices" }),
    ).toHaveAttribute("disabled");
  });

  it("renders Actions dropdown in the header", () => {
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    expect(screen.getByRole("button", { name: "Actions" })).toBeInTheDocument();
  });

  it("does not render Manage Snippets link in controls", () => {
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
    };
    renderPage();

    expect(
      screen.queryByRole("button", { name: "Manage Snippets" }),
    ).not.toBeInTheDocument();
  });
});
