import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
    const user = userEvent.setup();
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    await user.click(screen.getByText("Save"));

    expect(mockUpdateConfig).toHaveBeenCalled();
  });

  it("shows success toast after saving", async () => {
    const user = userEvent.setup();
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    await user.click(screen.getByText("Save"));

    expect(screen.getByText("Settings saved")).toBeInTheDocument();
  });

  it("shows error toast when save fails", async () => {
    const user = userEvent.setup();
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockRejectedValue(new Error("Network error"));
    await act(async () => {
      renderPage();
    });

    await user.click(screen.getByText("Save"));

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
    const user = userEvent.setup();
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    await user.click(screen.getByText("Save"));

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
    expect(screen.getByText("Enable dictation")).toBeInTheDocument();
    expect(screen.getByText("Ollama URL")).toBeInTheDocument();
    expect(screen.getByText("Ollama Model")).toBeInTheDocument();
  });

  it("hides dictation fields when isElectron is false", async () => {
    mockIsElectron.mockReturnValue(false);
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.queryByText("Dictation")).not.toBeInTheDocument();
    expect(screen.queryByText("Ollama URL")).not.toBeInTheDocument();
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

  it("saves dictation config values", async () => {
    const user = userEvent.setup();
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });
    await act(async () => {
      renderPage();
    });

    await user.click(screen.getByText("Save"));

    const savedConfig = mockUpdateConfig.mock.calls[0][0];
    expect(savedConfig.dictation).toEqual(DEFAULT_CONFIG.dictation);
  });

  it("shows microphone selector in dictation section", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Microphone")).toBeInTheDocument();
  });

  it("shows restart modal when saving service-affecting changes", async () => {
    const user = userEvent.setup();
    const enabledConfig = { ...DEFAULT_CONFIG, enable_dictation: true };
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    await act(async () => {
      renderPage();
    });

    // Toggle enable_dictation on (changes a restart field)
    const toggles = screen.getAllByRole("checkbox");
    const enableToggle = toggles.find(
      (toggle) => toggle.closest("[class*='toggle']") !== null,
    );
    // Find the "Disabled" text next to the enable_dictation toggle
    const enableDictationToggle = screen.getByText("Disabled").closest("label");
    if (enableDictationToggle) {
      await user.click(enableDictationToggle);
    }

    await user.click(screen.getByText("Save"));

    expect(screen.getByText("Restart services?")).toBeInTheDocument();
    expect(screen.getByText("Save and restart services")).toBeInTheDocument();
  });
});
