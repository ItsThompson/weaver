import { renderHook, act } from "@testing-library/react";
import { useServiceEvents } from "./useServiceEvents";
import { dispatchSSE } from "../../__tests__/helpers/dispatch-sse";

describe("useServiceEvents", () => {
  it("calls onServicesRestarting when servicesRestarting event fires", () => {
    const onServicesRestarting = vi.fn();
    renderHook(() => useServiceEvents({ onServicesRestarting }));

    act(() => dispatchSSE("servicesRestarting", {}));

    expect(onServicesRestarting).toHaveBeenCalledOnce();
  });

  it("does not call callback for unrelated events", () => {
    const onServicesRestarting = vi.fn();
    renderHook(() => useServiceEvents({ onServicesRestarting }));

    act(() => dispatchSSE("configChanged", {}));

    expect(onServicesRestarting).not.toHaveBeenCalled();
  });
});
