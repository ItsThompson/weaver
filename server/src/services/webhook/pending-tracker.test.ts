import { createPendingTracker } from "./pending-tracker";

describe("pending-tracker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("schedule fires callback after delay", async () => {
    const tracker = createPendingTracker();
    const cb = vi.fn().mockResolvedValue(undefined);
    tracker.schedule("s1", 1000, cb);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("cancel prevents callback from firing", async () => {
    const tracker = createPendingTracker();
    const cb = vi.fn().mockResolvedValue(undefined);
    tracker.schedule("s1", 1000, cb);
    tracker.cancel("s1");
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).not.toHaveBeenCalled();
  });

  it("cancel is a no-op for unknown session", () => {
    const tracker = createPendingTracker();
    expect(() => tracker.cancel("unknown")).not.toThrow();
  });

  it("schedule replaces existing timer for same session", async () => {
    const tracker = createPendingTracker();
    const cb1 = vi.fn().mockResolvedValue(undefined);
    const cb2 = vi.fn().mockResolvedValue(undefined);
    tracker.schedule("s1", 1000, cb1);
    tracker.schedule("s1", 1000, cb2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it("stopAll cancels all pending timers", async () => {
    const tracker = createPendingTracker();
    const cb1 = vi.fn().mockResolvedValue(undefined);
    const cb2 = vi.fn().mockResolvedValue(undefined);
    tracker.schedule("s1", 1000, cb1);
    tracker.schedule("s2", 2000, cb2);
    tracker.stopAll();
    await vi.advanceTimersByTimeAsync(2000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it("swallows callback errors", async () => {
    const tracker = createPendingTracker();
    const cb = vi.fn().mockRejectedValue(new Error("boom"));
    tracker.schedule("s1", 1000, cb);
    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();
  });
});
