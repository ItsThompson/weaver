import { jest } from "@jest/globals";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

jest.unstable_mockModule("../../utils/api", () => ({
  apiFetch: jest.fn(),
  getSessions: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getSession: jest.fn(),
  updateSessionName: jest.fn(),
  getOrphanCount: jest
    .fn<() => Promise<{ count: number }>>()
    .mockResolvedValue({ count: 0 }),
  getOrphans: jest.fn(),
  assignOrphans: jest.fn(),
  getConfig: jest.fn(),
  updateConfig: jest.fn<() => Promise<{ config: typeof DEFAULT_CONFIG }>>(),
}));

jest.unstable_mockModule("../../utils/isElectron", () => ({
  isElectron: jest.fn().mockReturnValue(false),
}));

const api = await import("../../utils/api");
const { SettingsPage } = await import("./SettingsPage");

const mockGetConfig = api.getConfig as jest.MockedFunction<
  typeof api.getConfig
>;
const mockUpdateConfig = api.updateConfig as jest.MockedFunction<
  typeof api.updateConfig
>;

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => jest.clearAllMocks());

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
});
