import { renderHook, act } from "@testing-library/react";
import { useSessionEvents } from "./useSessionEvents";
import {
  dispatchSSE,
  getLastEventSource,
} from "../../__tests__/helpers/dispatch-sse";

vi.mock("../queries", () => ({
  revalidateSessions: vi.fn(),
  revalidateSession: vi.fn(),
  revalidateConfig: vi.fn(),
}));

import {
  revalidateSessions,
  revalidateSession,
  revalidateConfig,
} from "../queries";

describe("useSessionEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("revalidates sessions and session on SSE update event after debounce", () => {
    renderHook(() => useSessionEvents(100));

    act(() => dispatchSSE("update", { sessionId: "abc" }));
    expect(revalidateSessions).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(revalidateSessions).toHaveBeenCalledOnce();
    expect(revalidateSession).toHaveBeenCalledWith("abc");
  });

  it("debounces rapid updates for the same session", () => {
    renderHook(() => useSessionEvents(100));

    act(() => {
      dispatchSSE("update", { sessionId: "abc" });
      vi.advanceTimersByTime(30);
      dispatchSSE("update", { sessionId: "abc" });
      vi.advanceTimersByTime(30);
      dispatchSSE("update", { sessionId: "abc" });
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(revalidateSessions).toHaveBeenCalledOnce();
    expect(revalidateSession).toHaveBeenCalledOnce();
  });

  it("revalidates config on configChanged event", () => {
    renderHook(() => useSessionEvents(100));

    act(() => dispatchSSE("configChanged", {}));
    expect(revalidateConfig).toHaveBeenCalledOnce();
  });

  it("closes EventSource and clears timers on unmount", () => {
    const { unmount } = renderHook(() => useSessionEvents(100));
    const source = getLastEventSource();
    const closeSpy = vi.spyOn(source, "close");

    act(() => dispatchSSE("update", { sessionId: "abc" }));
    unmount();

    expect(closeSpy).toHaveBeenCalledOnce();
    // Pending timer should have been cleared — revalidation should not fire
    vi.advanceTimersByTime(200);
    expect(revalidateSessions).not.toHaveBeenCalled();
  });
});
