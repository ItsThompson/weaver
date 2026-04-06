import { renderHook, act } from "@testing-library/react";
import { useSSE } from "./useSSE";
import {
  dispatchSSE,
  getLastEventSource,
} from "../../__tests__/helpers/dispatch-sse";

describe("useSSE", () => {
  it("calls handler when matching event fires", () => {
    const handler = vi.fn();
    renderHook(() => useSSE({ testEvent: handler }));

    act(() => dispatchSSE("testEvent", { key: "value" }));

    expect(handler).toHaveBeenCalledWith({ key: "value" });
  });

  it("handles multiple event types", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    renderHook(() => useSSE({ eventA: handlerA, eventB: handlerB }));

    act(() => {
      dispatchSSE("eventA", { a: 1 });
      dispatchSSE("eventB", { b: 2 });
    });

    expect(handlerA).toHaveBeenCalledWith({ a: 1 });
    expect(handlerB).toHaveBeenCalledWith({ b: 2 });
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useSSE({ test: vi.fn() }));
    const source = getLastEventSource();
    const closeSpy = vi.spyOn(source, "close");

    unmount();

    expect(closeSpy).toHaveBeenCalledOnce();
  });
});
