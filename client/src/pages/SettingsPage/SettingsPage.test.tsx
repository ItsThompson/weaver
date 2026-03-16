import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import { NotificationProvider } from "../../context/NotificationContext";
import { NotificationBar } from "../../components/NotificationBar/NotificationBar";

import "../../__tests__/mocks/api";

vi.mock("../../utils/isElectron", () => ({
  isElectron: vi.fn().mockReturnValue(false),
}));

import * as api from "../../utils/api";
import { SettingsPage } from "./SettingsPage";

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
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
      fieldErrors: {},
    });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Notification sounds")).toBeInTheDocument();
    expect(screen.getByText("Webhook URL")).toBeInTheDocument();
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
  });

  it("save button calls updateConfig", async () => {
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
      fieldErrors: {},
    });
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
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
      fieldErrors: {},
    });
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
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
      fieldErrors: {},
    });
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
      fieldErrors: {},
    });
    await act(async () => {
      renderPage();
    });

    expect(
      screen.getByText("webhook_url must start with http:// or https://"),
    ).toBeInTheDocument();
  });

  it("renders test runners section", async () => {
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
      fieldErrors: {},
    });
    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("Test runners")).toBeInTheDocument();
  });

  it("saves config with test_runners", async () => {
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
      fieldErrors: {},
    });
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
});
