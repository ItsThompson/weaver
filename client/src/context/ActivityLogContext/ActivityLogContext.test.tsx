import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ActivityLogProvider, useActivityLog } from "./ActivityLogContext";
import { dispatchSSE } from "../../__tests__/helpers/dispatch-sse";
import { NOTIFICATION_AUTO_DISMISS_MS } from "../../constants";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ActivityLogProvider>{children}</ActivityLogProvider>
);

describe("ActivityLogContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds entry on SSE update event", () => {
    const { result } = renderHook(() => useActivityLog(), { wrapper });

    act(() => {
      dispatchSSE("update", {
        sessionId: "abc",
        eventName: "agent-spawn",
        sessionName: "My Session",
      });
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].message).toBe("My Session → Starting");
    expect(result.current.entries[0].activity).toBe("starting");
  });

  it("deduplicates same activity for same session", () => {
    const { result } = renderHook(() => useActivityLog(), { wrapper });

    act(() => {
      dispatchSSE("update", {
        sessionId: "abc",
        eventName: "pre-tool-use",
        sessionName: "S",
      });
    });
    act(() => {
      dispatchSSE("update", {
        sessionId: "abc",
        eventName: "pre-tool-use",
        sessionName: "S",
      });
    });

    expect(result.current.entries).toHaveLength(1);
  });

  it("auto-dismisses entries after timeout", () => {
    const { result } = renderHook(() => useActivityLog(), { wrapper });

    act(() => {
      dispatchSSE("update", {
        sessionId: "abc",
        eventName: "agent-spawn",
        sessionName: "S",
      });
    });
    expect(result.current.entries).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(NOTIFICATION_AUTO_DISMISS_MS);
    });
    expect(result.current.entries).toHaveLength(0);
  });

  it("caps entries at MAX_ENTRIES (10)", () => {
    const { result } = renderHook(() => useActivityLog(), { wrapper });

    act(() => {
      for (let i = 0; i < 15; i++) {
        dispatchSSE("update", {
          sessionId: `s-${i}`,
          eventName: "agent-spawn",
          sessionName: `Session ${i}`,
        });
      }
    });

    expect(result.current.entries).toHaveLength(10);
  });
});
