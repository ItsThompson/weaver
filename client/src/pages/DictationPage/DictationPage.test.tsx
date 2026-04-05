import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type {
  DictationState,
  DictationActions,
} from "../../hooks/useDictation";
import { DictationPage } from "./DictationPage";

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
  mockState = {
    phase: "idle",
    rawTranscript: "",
    processedText: "",
    error: null,
    whisperStatus: false,
    ollamaStatus: false,
    hasModel: false,
    f4Active: false,
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

  it("disables controls and shows info Alert when F4 is active", () => {
    mockState = {
      ...mockState,
      phase: "ready",
      whisperStatus: true,
      hasModel: true,
      ollamaStatus: true,
      f4Active: true,
    };
    renderPage();

    expect(
      screen.getByText(
        "Dictation in progress via F4 shortcut. Controls are disabled.",
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
});
