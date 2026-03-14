import { jest } from "@jest/globals";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

jest.unstable_mockModule("../../../utils/api", () => ({
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

const api = await import("../../../utils/api");
const { useSettings } = await import("./useSettings");

const mockGetConfig = api.getConfig as jest.MockedFunction<
  typeof api.getConfig
>;
const mockUpdateConfig = api.updateConfig as jest.MockedFunction<
  typeof api.updateConfig
>;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

beforeEach(() => jest.clearAllMocks());

describe("useSettings", () => {
  it("returns default config initially", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    const { result } = renderHook(() => useSettings(), { wrapper });

    expect(result.current.state.config).toEqual(DEFAULT_CONFIG);
    expect(result.current.state.saving).toBe(false);
    expect(result.current.state.saveResult).toBeNull();
  });

  it("syncs config when data loads", async () => {
    const customConfig = { ...DEFAULT_CONFIG, dark_mode: false };
    mockGetConfig.mockResolvedValue({ config: customConfig, warnings: [] });

    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {});

    expect(result.current.state.config).toEqual(customConfig);
  });

  it("exposes warnings from server response", async () => {
    mockGetConfig.mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: ["ghost_mode must be a boolean"],
    });

    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {});

    expect(result.current.state.warnings).toEqual([
      "ghost_mode must be a boolean",
    ]);
    expect(result.current.state.hasWarnings).toBe(true);
  });

  it("handleSave calls updateConfig and sets success result", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });

    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {
      await result.current.actions.handleSave();
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith(DEFAULT_CONFIG);
    expect(result.current.state.saveResult).toEqual({
      type: "success",
      message: "Settings saved",
    });
    expect(result.current.state.saving).toBe(false);
  });

  it("handleSave sets error result on failure", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {
      await result.current.actions.handleSave();
    });

    expect(result.current.state.saveResult).toEqual({
      type: "error",
      message: "Network error",
    });
  });

  it("dismissSaveResult clears the save result", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });
    mockUpdateConfig.mockResolvedValue({ config: DEFAULT_CONFIG });

    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {
      await result.current.actions.handleSave();
    });
    expect(result.current.state.saveResult).not.toBeNull();

    act(() => {
      result.current.actions.dismissSaveResult();
    });
    expect(result.current.state.saveResult).toBeNull();
  });

  it("setConfig updates the config state", async () => {
    mockGetConfig.mockResolvedValue({ config: DEFAULT_CONFIG, warnings: [] });

    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => {
      result.current.actions.setConfig((prev) => ({
        ...prev,
        dark_mode: false,
      }));
    });

    expect(result.current.state.config.dark_mode).toBe(false);
  });
});
