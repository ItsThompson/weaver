import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import { NotificationProvider } from "../../context/NotificationContext";
import { NotificationBar } from "../../components/NotificationBar/NotificationBar";
import { CONFIG_WITH_CATEGORIES } from "../../__tests__/fixtures/config";

import "../../__tests__/mocks/api";

vi.mock("../../utils/isElectron", () => ({
  isElectron: vi.fn().mockReturnValue(false),
}));

vi.mock("../../hooks/useAudioDevices", () => ({
  useAudioDevices: () => ({
    devices: [{ deviceId: "mic-1", label: "USB Microphone" }],
    loading: false,
    refresh: vi.fn(),
  }),
}));

import { isElectron } from "../../utils/isElectron";
import * as api from "../../utils/api";
import { SettingsPage } from "./SettingsPage";

const mockIsElectron = vi.mocked(isElectron);
const mockGetConfig = vi.mocked(api.getConfig);
const mockUpdateConfig = vi.mocked(api.updateConfig);
const mockGetDictationStatus = vi.mocked(api.getDictationStatus);

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <NotificationProvider>
          <SettingsPage />
          <NotificationBar />
        </NotificationProvider>
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("SettingsPage", () => {
  it("renders current config values", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Notification sounds")).toBeInTheDocument();
    expect(screen.getByText("Webhook URL")).toBeInTheDocument();
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
  });

  it("save button calls updateConfig", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(mockUpdateConfig).toHaveBeenCalled();
  });

  it("shows success toast after saving", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(screen.getByText("Settings saved")).toBeInTheDocument();
  });

  it("shows error toast when save fails", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockRejectedValue(new Error("Network error"));
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("displays validation warnings", async () => {
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: ["webhook_url must start with http:// or https://"],
    });
    await act(async () => {
      renderPage();
    });

    expect(
      screen.getByText("webhook_url must start with http:// or https://"),
    ).toBeInTheDocument();
  });

  it("renders test runners section", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Test runners")).toBeInTheDocument();
  });

  it("saves config with test_runners", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    const savedConfig = mockUpdateConfig.mock.calls[0][0];
    expect(savedConfig.test_runners).toEqual(DEFAULT_CONFIG.test_runners);
  });

  it("renders skill graph categories from config", async () => {
    mockGetConfig.mockResolvedValue({
      config: CONFIG_WITH_CATEGORIES,
      warnings: [],
    });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByDisplayValue("core")).toBeInTheDocument();
    expect(screen.getByDisplayValue("#ff6b6b")).toBeInTheDocument();
  });
});

describe("SettingsPage dictation section", () => {
  beforeEach(() => {
    mockIsElectron.mockReturnValue(true);
  });

  afterEach(() => {
    mockIsElectron.mockReturnValue(false);
  });

  it("shows dictation fields when isElectron is true", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Dictation")).toBeInTheDocument();
    expect(screen.getByText("Ollama URL")).toBeInTheDocument();
    expect(screen.getByText("Ollama Model")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Test Connection" }),
    ).toBeInTheDocument();
  });

  it("hides dictation fields when isElectron is false", async () => {
    mockIsElectron.mockReturnValue(false);
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.queryByText("Dictation")).not.toBeInTheDocument();
    expect(screen.queryByText("Ollama URL")).not.toBeInTheDocument();
    expect(screen.queryByText("Ollama Model")).not.toBeInTheDocument();
  });

  it("renders default dictation config values", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(
      screen.getByDisplayValue("http://localhost:11434"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("phi4-mini")).toBeInTheDocument();
  });

  it("Test Connection shows success when Ollama is reachable", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockGetDictationStatus.mockResolvedValue({
      whisper: true,
      ollama: true,
      ollamaError: null,
      ollamaModel: "phi4-mini",
      model: null,
    });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
    });

    expect(screen.getByText("Ollama is reachable")).toBeInTheDocument();
  });

  it("Test Connection shows failure when Ollama is unreachable", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockGetDictationStatus.mockResolvedValue({
      whisper: false,
      ollama: false,
      ollamaError: "not_installed",
      ollamaModel: "phi4-mini",
      model: null,
    });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
    });

    expect(screen.getByText("Cannot reach Ollama")).toBeInTheDocument();
  });

  it("Test Connection shows failure when API call throws", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockGetDictationStatus.mockRejectedValue(new Error("Network error"));
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
    });

    expect(screen.getByText("Cannot reach Ollama")).toBeInTheDocument();
  });

  it("saves dictation config values", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    const savedConfig = mockUpdateConfig.mock.calls[0][0];
    expect(savedConfig.dictation).toEqual(DEFAULT_CONFIG.dictation);
  });

  it("shows microphone selector in dictation section", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Microphone")).toBeInTheDocument();
    expect(screen.getByText("System Default")).toBeInTheDocument();
  });

  it("hides microphone selector when isElectron is false", async () => {
    mockIsElectron.mockReturnValue(false);
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.queryByText("Microphone")).not.toBeInTheDocument();
  });

  it("saves microphone_device_id with config", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    const savedConfig = mockUpdateConfig.mock.calls[0][0];
    expect(savedConfig.dictation.microphone_device_id).toBe("");
  });
});
