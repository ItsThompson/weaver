import React from "react";
import { renderHook, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

import "../../../__tests__/mocks/api";

import * as api from "../../../utils/api";
import { useSettings } from "./useSettings";

const mockGetConfig = vi.mocked(api.getConfig);
const mockUpdateConfig = vi.mocked(api.updateConfig);

const mockAddNotification = vi.fn();

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("useSettings", () => {
  it("returns default config while loading", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    const { result } = renderHook(() => useSettings(mockAddNotification), {
      wrapper,
    });

    expect(result.current.state.config).toEqual(DEFAULT_CONFIG);
    expect(result.current.state.isLoading).toBe(true);
    expect(result.current.state.saving).toBe(false);
  });

  it("returns server config once loaded", async () => {
    const customConfig = { ...DEFAULT_CONFIG, dark_mode: false };
    mockGetConfig.mockResolvedValue({ config: customConfig, warnings: [] });

    const { result } = renderHook(() => useSettings(mockAddNotification), {
      wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.state.isLoading).toBe(false);
    });

    expect(result.current.state.config).toEqual(customConfig);
  });

  it("exposes warnings from server response", async () => {
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: ["ghost_mode must be a boolean"],
    });

    const { result } = renderHook(() => useSettings(mockAddNotification), {
      wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.state.isLoading).toBe(false);
    });

    expect(result.current.state.warnings).toEqual([
      "ghost_mode must be a boolean",
    ]);
    expect(result.current.state.hasWarnings).toBe(true);
  });

  it("handleSave calls updateConfig and notifies success", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });

    const { result } = renderHook(() => useSettings(mockAddNotification), {
      wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.state.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.actions.handleSave();
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith(DEFAULT_CONFIG);
    expect(mockAddNotification).toHaveBeenCalledWith(
      "Settings saved",
      "success",
    );
    expect(result.current.state.saving).toBe(false);
  });

  it("handleSave notifies error on failure", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSettings(mockAddNotification), {
      wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.state.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.actions.handleSave();
    });

    expect(mockAddNotification).toHaveBeenCalledWith("Network error", "error");
  });

  it("setConfig updates the config state", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });

    const { result } = renderHook(() => useSettings(mockAddNotification), {
      wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.state.isLoading).toBe(false);
    });

    act(() => {
      result.current.actions.setConfig((prev) => ({
        ...prev,
        dark_mode: false,
      }));
    });

    expect(result.current.state.config.dark_mode).toBe(false);
  });

  it("stays loading until server config is available", async () => {
    const customConfig = { ...DEFAULT_CONFIG, dark_mode: false };
    mockGetConfig.mockResolvedValue({ config: customConfig, warnings: [] });

    const { result } = renderHook(() => useSettings(mockAddNotification), {
      wrapper,
    });

    expect(result.current.state.isLoading).toBe(true);

    await vi.waitFor(() => {
      expect(result.current.state.isLoading).toBe(false);
    });

    expect(result.current.state.config).toEqual(customConfig);
  });
});
