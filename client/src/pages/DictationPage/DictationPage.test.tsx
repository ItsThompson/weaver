import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import type { ServicesStatusResponse } from "@weaver/shared/types";
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

const mockStartDictation = vi.fn();
const mockStopDictation = vi.fn();
const mockCopyToClipboard = vi.fn();

let mockDictationState = {
  phase: "idle" as string,
  rawTranscript: "",
  processedText: "",
  error: null as string | null,
  deviceWarning: null as string | null,
  hotkeyActive: false,
};

vi.mock("../../hooks/useDictation", () => ({
  useDictation: () => ({
    state: mockDictationState,
    actions: {
      startDictation: mockStartDictation,
      stopDictation: mockStopDictation,
      copyToClipboard: mockCopyToClipboard,
      reset: vi.fn(),
    },
  }),
}));

vi.mock("../../utils/api", () => ({
  patchConfig: vi.fn().mockResolvedValue({}),
  getServicesStatus: vi.fn(),
  transcribeAudio: vi.fn(),
  processTranscript: vi.fn(),
  getSnippets: vi.fn().mockResolvedValue({ snippets: [] }),
  getModels: vi.fn().mockResolvedValue({ available: [], local: [] }),
}));

let mockConfig = { ...DEFAULT_CONFIG, enable_dictation: true };

vi.mock("../../hooks/queries", () => ({
  useConfigQuery: () => ({
    data: { config: mockConfig, warnings: [] },
  }),
  revalidateConfig: vi.fn(),
}));

vi.mock("../../hooks/useAudioDevices", () => ({
  useAudioDevices: () => ({
    devices: [{ deviceId: "mic-1", label: "USB Mic" }],
    loading: false,
    refresh: vi.fn(),
  }),
  resolveDeviceId: vi
    .fn()
    .mockResolvedValue({ deviceId: undefined, isStale: false }),
}));

import { getServicesStatus } from "../../utils/api";

const mockGetServicesStatus = vi.mocked(getServicesStatus);

const runningStatus: ServicesStatusResponse = {
  ready: true,
  services: {
    whisper: { state: "running" },
    ollama: { state: "running" },
  },
};

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
  mockConfig = { ...DEFAULT_CONFIG, enable_dictation: true };
  mockGetServicesStatus.mockResolvedValue(runningStatus);
  mockDictationState = {
    phase: "idle",
    rawTranscript: "",
    processedText: "",
    error: null,
    deviceWarning: null,
    hotkeyActive: false,
  };
});

describe("DictationPage", () => {
  describe("service states", () => {
    it("shows disabled message when enable_dictation is false", () => {
      mockConfig = { ...DEFAULT_CONFIG, enable_dictation: false };
      renderPage();

      expect(
        screen.getByText("Dictation is disabled. Enable it in Settings."),
      ).toBeInTheDocument();
    });

    it("shows loading indicator while services status is loading", () => {
      mockGetServicesStatus.mockReturnValue(new Promise(() => {}));
      renderPage();

      expect(
        screen.getByText("Checking service status..."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Start Dictation")).not.toBeInTheDocument();
    });

    it("shows dictation controls when enabled and services are running", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Start Dictation")).toBeInTheDocument();
      });
    });

    it("shows error alert when whisper has an error", async () => {
      mockGetServicesStatus.mockResolvedValue({
        ready: true,
        services: {
          whisper: { state: "error", error: "Failed" },
          ollama: { state: "running" },
        },
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText(
            "Dictation is unavailable. Check service status in Settings.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("shows error alert when ollama has an error", async () => {
      mockGetServicesStatus.mockResolvedValue({
        ready: true,
        services: {
          whisper: { state: "running" },
          ollama: { state: "error", error: "Ollama not found" },
        },
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText(
            "Dictation is unavailable. Check service status in Settings.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("shows model download when whisper is not_configured", async () => {
      mockGetServicesStatus.mockResolvedValue({
        ready: true,
        services: {
          whisper: { state: "not_configured" },
          ollama: { state: "not_configured" },
        },
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText("Download Speech Recognition Model"),
        ).toBeInTheDocument();
      });
    });

    it("enables Start button when ollama is not_configured", async () => {
      mockGetServicesStatus.mockResolvedValue({
        ready: true,
        services: {
          whisper: { state: "running" },
          ollama: { state: "not_configured" },
        },
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Start Dictation" }),
        ).not.toBeDisabled();
      });
    });
  });

  describe("dictation controls", () => {
    it("calls startDictation when Start button is clicked", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Start Dictation")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: "Start Dictation" }));
      expect(mockStartDictation).toHaveBeenCalledOnce();
    });

    it("shows Stop button during recording", async () => {
      mockDictationState = {
        ...mockDictationState,
        phase: "recording",
        rawTranscript: "hello world",
      };
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Stop Dictation" }),
        ).toBeInTheDocument();
      });
    });

    it("calls stopDictation when Stop button is clicked", async () => {
      const user = userEvent.setup();
      mockDictationState = { ...mockDictationState, phase: "recording" };
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Stop Dictation")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: "Stop Dictation" }));
      expect(mockStopDictation).toHaveBeenCalledOnce();
    });

    it("shows Processing indicator during processing phase", async () => {
      mockDictationState = { ...mockDictationState, phase: "processing" };
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Processing...")).toBeInTheDocument();
      });
    });

    it("calls copyToClipboard when Copy button is clicked", async () => {
      const user = userEvent.setup();
      mockDictationState = {
        ...mockDictationState,
        phase: "done",
        processedText: "Hello, world.",
      };
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Copy to Clipboard")).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: "Copy to Clipboard" }),
      );
      expect(mockCopyToClipboard).toHaveBeenCalledOnce();
    });
  });

  describe("hotkey active", () => {
    it("disables Start button and shows info alert when hotkey is active", async () => {
      mockHotkeyActive = true;
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText(
            "Dictation in progress via hotkey. Controls are disabled.",
          ),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByRole("button", { name: "Start Dictation" }),
      ).toBeDisabled();
    });

    it("disables mic selector when hotkey is active", async () => {
      mockHotkeyActive = true;
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Refresh devices" }),
        ).toHaveAttribute("disabled");
      });
    });
  });

  describe("device warning", () => {
    it("shows device warning alert when present", async () => {
      mockDictationState = {
        ...mockDictationState,
        deviceWarning:
          "Previously selected microphone is no longer available. Using system default.",
      };
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText(
            "Previously selected microphone is no longer available. Using system default.",
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("error state", () => {
    it("shows dictation error alert", async () => {
      mockDictationState = {
        ...mockDictationState,
        phase: "error",
        error: "Microphone access failed",
      };
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText("Microphone access failed"),
        ).toBeInTheDocument();
      });
    });
  });
});
