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
  return {
    schedule(sessionId, delayMs, callback) {
      const existing = timers.get(sessionId);
      if (existing) {
        clearTimeout(existing);
        timers.delete(sessionId);
      }
      timers.set(
        sessionId,
        setTimeout(async () => {
          timers.delete(sessionId);
          await callback();
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
}
