import React from "react";
import { renderHook, act } from "@testing-library/react";
import { SWRConfig } from "swr";

import "../../../__tests__/mocks/api";

import * as api from "../../../utils/api";
import { useOrphansPage } from "./useOrphansPage";

const mockGetOrphans = vi.mocked(api.getOrphans);
const mockGetSessions = vi.mocked(api.getSessions);
const mockAssignOrphans = vi.mocked(api.assignOrphans);
const mockDeleteOrphans = vi.mocked(api.deleteOrphans);

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("useOrphansPage", () => {
  it("returns loading state initially", () => {
    mockGetOrphans.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useOrphansPage(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.groups).toEqual([]);
  });

  it("derives sessionOptions sorted by startTime descending", async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    mockGetSessions.mockResolvedValue([
      {
        id: "a",
        pid: 1,
        cwd: "/a",
        customName: "Alpha",
        agentName: null,
        startTime: "2026-01-01T00:00:00Z",
        lastEventTime: "2026-01-01T00:01:00Z",
        status: "closed",
      },
      {
        id: "b",
        pid: 2,
        cwd: "/b",
        customName: null,
        agentName: null,
        startTime: "2026-01-02T00:00:00Z",
        lastEventTime: "2026-01-02T00:01:00Z",
        status: "open",
      },
    ] as any);

    const { result } = renderHook(() => useOrphansPage(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.sessionOptions.length).toBe(2);
    });

    expect(result.current.sessionOptions[0].label).toBe("Session b");
    expect(result.current.sessionOptions[1].label).toBe("Alpha");
  });

  it("selectSession updates selectedSessions", async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    const { result } = renderHook(() => useOrphansPage(), { wrapper });

    act(() => {
      result.current.selectSession(100, { value: "aaa", label: "Session A" });
    });

    expect(result.current.selectedSessions[100]).toEqual({
      value: "aaa",
      label: "Session A",
    });
  });

  it("handleAssign calls API and clears selection on success", async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    mockAssignOrphans.mockResolvedValue(undefined as any);
    const { result } = renderHook(() => useOrphansPage(), { wrapper });

    act(() => {
      result.current.selectSession(100, { value: "aaa", label: "Session A" });
    });

    await act(async () => {
      await result.current.handleAssign(100);
    });

    expect(mockAssignOrphans).toHaveBeenCalledWith("aaa", 100);
    expect(result.current.selectedSessions[100]).toBeUndefined();
  });

  it("handleAssign does nothing when no session selected", async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    const { result } = renderHook(() => useOrphansPage(), { wrapper });

    await act(async () => {
      await result.current.handleAssign(100);
    });

    expect(mockAssignOrphans).not.toHaveBeenCalled();
  });

  it("handleAssign logs error on failure", async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    mockAssignOrphans.mockRejectedValue(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useOrphansPage(), { wrapper });

    act(() => {
      result.current.selectSession(100, { value: "aaa", label: "Session A" });
    });

    await act(async () => {
      await result.current.handleAssign(100);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to assign orphans:",
      expect.any(Error),
    );
    expect(result.current.assigning).toBeNull();
    consoleSpy.mockRestore();
  });

  it("handleDelete calls API and resets state", async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    mockDeleteOrphans.mockResolvedValue(undefined as any);
    const { result } = renderHook(() => useOrphansPage(), { wrapper });

    act(() => {
      result.current.setDeleteTarget({ pid: 100, eventCount: 5 });
    });

    expect(result.current.deleteTarget).toEqual({ pid: 100, eventCount: 5 });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockDeleteOrphans).toHaveBeenCalledWith(100);
    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.deleting).toBe(false);
  });

  it("handleDelete does nothing when no target", async () => {
    mockGetOrphans.mockResolvedValue({ groups: [] });
    const { result } = renderHook(() => useOrphansPage(), { wrapper });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockDeleteOrphans).not.toHaveBeenCalled();
  });
});
