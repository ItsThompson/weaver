import { log } from "../../utils/logger";

export interface PendingTracker {
  schedule(
    sessionId: string,
    delayMs: number,
    callback: () => Promise<void>,
  ): void;
  cancel(sessionId: string): void;
  stopAll(): void;
}

export function createPendingTracker(): PendingTracker {
  const timers = new Map<string, NodeJS.Timeout>();
  const tracker: PendingTracker = {
    schedule(sessionId, delayMs, callback) {
      tracker.cancel(sessionId);
      timers.set(
        sessionId,
        setTimeout(async () => {
          timers.delete(sessionId);
          try {
            await callback();
          } catch (err) {
            // Safety net: prevents unhandled rejections from setTimeout's async wrapper.
            // Callers should handle errors within their callback, but if they don't,
            // this ensures failures are visible rather than silently swallowed.
            log({
              timestamp: new Date().toISOString(),
              event: "pending_tracker_callback_error",
              error: String(err),
            });
          }
        }, delayMs),
      );
    },
    cancel(sessionId) {
      const timer = timers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
        timers.delete(sessionId);
      }
    },
    stopAll() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    },
  };
  return tracker;
}
