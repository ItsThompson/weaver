import { renderHook, waitFor, act } from "@testing-library/react";
import { useServicesStatus } from "./useServicesStatus";
import type { ServicesStatusResponse } from "@weaver/shared/types";

vi.mock("../../utils/api", () => ({
  getServicesStatus: vi.fn(),
}));

import { getServicesStatus } from "../../utils/api";

const runningStatus: ServicesStatusResponse = {
  ready: true,
  services: {
    whisper: { state: "running" },
    ollama: { state: "running" },
  },
};

describe("useServicesStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServicesStatus).mockResolvedValue(runningStatus);
  });

  it("fetches status on mount", async () => {
    const { result } = renderHook(() => useServicesStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toEqual(runningStatus);
    expect(getServicesStatus).toHaveBeenCalledOnce();
  });

  it("refetch updates status", async () => {
    const { result } = renderHook(() => useServicesStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedStatus: ServicesStatusResponse = {
      ready: true,
      services: {
        whisper: { state: "error", error: "crashed" },
        ollama: { state: "running" },
      },
    };
    vi.mocked(getServicesStatus).mockResolvedValue(updatedStatus);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.status).toEqual(updatedStatus);
  });

  it("polls when pollInterval is set", async () => {
    vi.useFakeTimers();

    renderHook(() => useServicesStatus({ pollInterval: 1000 }));

    // Initial fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(getServicesStatus).toHaveBeenCalledOnce();

    // After one interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(getServicesStatus).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("stops polling on unmount", async () => {
    vi.useFakeTimers();

    const { unmount } = renderHook(() =>
      useServicesStatus({ pollInterval: 1000 }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(getServicesStatus).toHaveBeenCalledOnce();

    unmount();

    await vi.advanceTimersByTimeAsync(2000);
    expect(getServicesStatus).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});
