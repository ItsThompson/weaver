import { renderHook, act } from "@testing-library/react";
import { NotificationProvider, useNotifications } from "./NotificationContext";
import {
  NOTIFICATION_AUTO_DISMISS_MS,
  NOTIFICATION_MAX_VISIBLE,
} from "../../constants";
import type { ReactNode } from "react";

const mockPlaySound = vi.fn();
vi.mock("../../hooks/notifications/soundUtils", () => ({
  playNotificationSound: (...args: unknown[]) => mockPlaySound(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}

describe("NotificationContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPlaySound.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds and exposes notifications", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => result.current.addNotification("Test message", "info"));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].content).toBe("Test message");
    expect(result.current.notifications[0].type).toBe("info");
  });

  it("auto-dismisses after timeout", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => result.current.addNotification("Temp", "info"));
    expect(result.current.notifications).toHaveLength(1);

    act(() => vi.advanceTimersByTime(NOTIFICATION_AUTO_DISMISS_MS));
    expect(result.current.notifications).toHaveLength(0);
  });

  it("respects max visible limit", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.addNotification(`msg-${i}`, "info");
      }
    });

    expect(result.current.notifications).toHaveLength(NOTIFICATION_MAX_VISIBLE);
    // Oldest trimmed — remaining are the last 3
    expect(result.current.notifications[0].content).toBe("msg-2");
  });

  it("dismisses by id", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      result.current.addNotification("first", "info");
      result.current.addNotification("second", "info");
    });

    const firstId = result.current.notifications[0].id;

    act(() => result.current.dismissNotification(firstId));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].content).toBe("second");
  });

  it("plays sound when specified", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => result.current.addNotification("msg", "info", "chime"));

    expect(mockPlaySound).toHaveBeenCalledWith("chime");
  });

  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useNotifications())).toThrow(
      "useNotifications must be used within NotificationProvider",
    );
  });
});
