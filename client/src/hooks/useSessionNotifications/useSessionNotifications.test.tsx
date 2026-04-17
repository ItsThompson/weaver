import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { useSessionNotifications } from "./useSessionNotifications";
import {
  NotificationProvider,
  useNotifications,
} from "../../context/NotificationContext";
import { ActivityLogProvider } from "../../context/ActivityLogContext";
import { dispatchSSE } from "../../__tests__/helpers/dispatch-sse";

vi.mock("../../hooks/notifications/soundUtils", () => ({
  playNotificationSound: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NotificationProvider>
    <ActivityLogProvider>{children}</ActivityLogProvider>
  </NotificationProvider>
);

describe("useSessionNotifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches notification for new activity", () => {
    const { result } = renderHook(
      () => {
        useSessionNotifications();
        return useNotifications();
      },
      { wrapper },
    );

    act(() => {
      dispatchSSE("update", {
        sessionId: "abc",
        eventName: "agent-spawn",
        sessionName: "My Session",
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].content).toBe(
      "My Session → Starting",
    );
  });

  it("does not dispatch duplicate notifications for seen entries", () => {
    const { result } = renderHook(
      () => {
        useSessionNotifications();
        return useNotifications();
      },
      { wrapper },
    );

    act(() => {
      dispatchSSE("update", {
        sessionId: "abc",
        eventName: "agent-spawn",
        sessionName: "S",
      });
    });

    // Same session + same activity → no new activity log entry → no new notification
    act(() => {
      dispatchSSE("update", {
        sessionId: "abc",
        eventName: "agent-spawn",
        sessionName: "S",
      });
    });

    expect(result.current.notifications).toHaveLength(1);
  });
});
