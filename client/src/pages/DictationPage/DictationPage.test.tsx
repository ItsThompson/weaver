import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("../../hooks/useHotkeyDictation", () => ({
  useHotkeyDictationActive: () => false,
}));

vi.mock("../../utils/api", () => ({
  patchConfig: vi.fn().mockResolvedValue({}),
  getServicesStatus: vi.fn(),
  transcribeAudio: vi.fn(),
  processTranscript: vi.fn(),
  getSnippets: vi.fn().mockResolvedValue({ snippets: [] }),
  getModels: vi.fn().mockResolvedValue({ available: [], local: [] }),
}));

let mockConfig = { ...DEFAULT_CONFIG };

vi.mock("../../hooks/queries", () => ({
  useConfigQuery: () => ({
    data: { config: mockConfig, warnings: [] },
  }),
  revalidateConfig: vi.fn(),
}));

vi.mock("../../hooks/useAudioCapture", () => ({
  useAudioCapture: () => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    onChunk: vi.fn(),
  }),
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
  mockConfig = { ...DEFAULT_CONFIG };
  mockGetServicesStatus.mockResolvedValue(runningStatus);
});

describe("DictationPage", () => {
  it("shows disabled message when enable_dictation is false", () => {
    mockConfig = { ...DEFAULT_CONFIG, enable_dictation: false };
    renderPage();

    expect(
      screen.getByText("Dictation is disabled. Enable it in Settings."),
    ).toBeInTheDocument();
  });

  it("shows dictation controls when enabled and whisper is running", async () => {
    mockConfig = { ...DEFAULT_CONFIG, enable_dictation: true };
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Start Dictation")).toBeInTheDocument();
    });
  });

  it("shows error alert when services have errors", async () => {
    mockConfig = { ...DEFAULT_CONFIG, enable_dictation: true };
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

  it("shows model download when whisper is not_configured", async () => {
    mockConfig = { ...DEFAULT_CONFIG, enable_dictation: true };
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
});
