import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/child-process";

import { readdir, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import type { Session } from "@weaver/shared/types";
import { Harness } from "@weaver/shared/types";
import {
  createLifecycleManager,
  type LifecycleDeps,
  type LifecycleManager,
} from "./lifecycle";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    pid: 100,
    customName: null,
    cwd: "/tmp",
    agentName: null,
    harness: Harness.KIRO_CLI,
    startTime: "t1",
    lastEventTime: "t1",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<LifecycleDeps> = {}): LifecycleDeps {
  return {
    readSessions: vi.fn<() => Promise<Session[]>>().mockResolvedValue([]),
    log: vi.fn(),
    weaverDir: vi.fn<() => string>().mockReturnValue("/fake/.weaver"),
    ...overrides,
  };
}

function mockExecFileOutput(stdout: string) {
  vi.mocked(execFile).mockImplementation(((
    _cmd: unknown,
    _args: unknown,
    cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    cb(null, { stdout, stderr: "" });
  }) as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("isProcessRunning", () => {
  it("returns true for a running process with matching name", async () => {
    const manager = createLifecycleManager(makeDeps());
    mockExecFileOutput("/path/to/kiro-cli chat --agent dev\n");
    await expect(
      manager.isProcessRunning(process.pid, "kiro-cli"),
    ).resolves.toBe(true);
  });

  it("returns false for a non-existent process", async () => {
    const manager = createLifecycleManager(makeDeps());
    await expect(manager.isProcessRunning(999999, "kiro-cli")).resolves.toBe(
      false,
    );
  });

  it("returns false when PID is alive but process name differs (PID reuse)", async () => {
    const manager = createLifecycleManager(makeDeps());
    mockExecFileOutput("/usr/bin/some-other-process\n");
    await expect(
      manager.isProcessRunning(process.pid, "kiro-cli"),
    ).resolves.toBe(false);
  });

  it("matches claude process name", async () => {
    const manager = createLifecycleManager(makeDeps());
    mockExecFileOutput("/usr/local/bin/claude --session abc\n");
    await expect(manager.isProcessRunning(process.pid, "claude")).resolves.toBe(
      true,
    );
  });
});

describe("cleanStaleSessions", () => {
  it("deletes marker files for dead PIDs", async () => {
    const deps = makeDeps({
      readSessions: vi
        .fn<() => Promise<Session[]>>()
        .mockResolvedValue([makeSession({ pid: 999 })]),
    });
    const manager = createLifecycleManager(deps);
    vi.spyOn(manager, "isProcessRunning").mockResolvedValue(false);
    vi.mocked(readdir).mockResolvedValue([".current-session-999"] as any);

    await manager.cleanStaleSessions();
    expect(vi.mocked(unlink)).toHaveBeenCalledWith(
      expect.stringContaining(".current-session-999"),
    );
  });

  it("preserves marker files for live PIDs", async () => {
    const deps = makeDeps({
      readSessions: vi
        .fn<() => Promise<Session[]>>()
        .mockResolvedValue([makeSession({ pid: 123 })]),
    });
    const manager = createLifecycleManager(deps);
    vi.spyOn(manager, "isProcessRunning").mockResolvedValue(true);
    vi.mocked(readdir).mockResolvedValue([".current-session-123"] as any);

    await manager.cleanStaleSessions();
    expect(vi.mocked(unlink)).not.toHaveBeenCalled();
  });

  it("skips marker files with no matching session when PID is alive", async () => {
    const manager = createLifecycleManager(makeDeps());
    vi.mocked(readdir).mockResolvedValue([
      `.current-session-${process.pid}`,
    ] as any);

    await manager.cleanStaleSessions();
    expect(vi.mocked(unlink)).not.toHaveBeenCalled();
  });

  it("deletes orphaned marker files when PID is dead and no session exists", async () => {
    const deps = makeDeps();
    const manager = createLifecycleManager(deps);
    vi.mocked(readdir).mockResolvedValue([".current-session-999999"] as any);

    await manager.cleanStaleSessions();
    expect(vi.mocked(unlink)).toHaveBeenCalledWith(
      expect.stringContaining(".current-session-999999"),
    );
  });

  it("handles readdir failure gracefully", async () => {
    const manager = createLifecycleManager(makeDeps());
    vi.mocked(readdir).mockRejectedValue(new Error("no such directory"));

    await expect(manager.cleanStaleSessions()).resolves.toBeUndefined();
  });

  it("skips files with non-numeric PID suffixes", async () => {
    const manager = createLifecycleManager(makeDeps());
    vi.mocked(readdir).mockResolvedValue([".current-session-abc"] as any);

    await manager.cleanStaleSessions();
    expect(vi.mocked(unlink)).not.toHaveBeenCalled();
  });

  it("logs when a stale file is deleted", async () => {
    const deps = makeDeps({
      readSessions: vi
        .fn<() => Promise<Session[]>>()
        .mockResolvedValue([makeSession({ pid: 999 })]),
    });
    const manager = createLifecycleManager(deps);
    vi.spyOn(manager, "isProcessRunning").mockResolvedValue(false);
    vi.mocked(readdir).mockResolvedValue([".current-session-999"] as any);

    await manager.cleanStaleSessions();
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "stale_session_cleaned", pid: 999 }),
    );
  });
});

describe("startPidPolling", () => {
  it("calls readSessions on first invocation", async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const manager = createLifecycleManager(deps);
    vi.spyOn(manager, "isProcessRunning").mockResolvedValue(true);

    manager.startPidPolling(vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.readSessions).toHaveBeenCalledTimes(1);
    manager.stopStaleSessionCleanup();
  });

  it("calls onSessionClosed when a PID disappears between polls", async () => {
    vi.useFakeTimers();
    const session = makeSession({ id: "s1", pid: 100 });
    const deps = makeDeps({
      readSessions: vi
        .fn<() => Promise<Session[]>>()
        .mockResolvedValue([session]),
    });
    const manager = createLifecycleManager(deps);
    const isRunning = vi
      .spyOn(manager, "isProcessRunning")
      .mockResolvedValue(true);
    const onClosed = vi.fn();

    manager.startPidPolling(onClosed);
    // First poll: PID 100 alive → tracked
    await vi.advanceTimersByTimeAsync(0);
    expect(onClosed).not.toHaveBeenCalled();

    // Second poll: PID 100 dead
    isRunning.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onClosed).toHaveBeenCalledWith("s1");

    manager.stopStaleSessionCleanup();
  });

  it("tracks new PIDs without calling onSessionClosed", async () => {
    vi.useFakeTimers();
    const session = makeSession({ id: "s1", pid: 200 });
    const deps = makeDeps({
      readSessions: vi
        .fn<() => Promise<Session[]>>()
        .mockResolvedValue([session]),
    });
    const manager = createLifecycleManager(deps);
    vi.spyOn(manager, "isProcessRunning").mockResolvedValue(true);
    const onClosed = vi.fn();

    manager.startPidPolling(onClosed);
    await vi.advanceTimersByTimeAsync(0);

    expect(onClosed).not.toHaveBeenCalled();
    manager.stopStaleSessionCleanup();
  });

  it("correctly tracks PID transitions across multiple poll cycles", async () => {
    vi.useFakeTimers();
    const s1 = makeSession({ id: "s1", pid: 100 });
    const s2 = makeSession({ id: "s2", pid: 200 });
    const readSessions = vi.fn<() => Promise<Session[]>>();
    const deps = makeDeps({ readSessions });
    const manager = createLifecycleManager(deps);
    const isRunning = vi.spyOn(manager, "isProcessRunning");
    const onClosed = vi.fn();

    // Poll 1: both alive
    readSessions.mockResolvedValue([s1, s2]);
    isRunning.mockResolvedValue(true);
    manager.startPidPolling(onClosed);
    await vi.advanceTimersByTimeAsync(0);
    expect(onClosed).not.toHaveBeenCalled();

    // Poll 2: PID 100 dies, PID 200 still alive
    isRunning.mockImplementation(async (pid) => pid === 200);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onClosed).toHaveBeenCalledWith("s1");
    expect(onClosed).toHaveBeenCalledTimes(1);

    // Poll 3: PID 200 also dies
    isRunning.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onClosed).toHaveBeenCalledWith("s2");
    expect(onClosed).toHaveBeenCalledTimes(2);

    manager.stopStaleSessionCleanup();
  });
});

describe("stopStaleSessionCleanup", () => {
  it("clears all intervals", async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const manager = createLifecycleManager(deps);
    vi.spyOn(manager, "isProcessRunning").mockResolvedValue(true);

    manager.startStaleSessionCleanup();
    manager.startPidPolling(vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    manager.stopStaleSessionCleanup();

    // After stopping, advancing time should not trigger more calls
    const callCount = vi.mocked(deps.readSessions).mock.calls.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(vi.mocked(deps.readSessions).mock.calls.length).toBe(callCount);
  });
});

describe("isolated instances", () => {
  it("two managers have independent state", async () => {
    vi.useFakeTimers();
    const session = makeSession({ id: "s1", pid: 100 });
    const deps1 = makeDeps({
      readSessions: vi
        .fn<() => Promise<Session[]>>()
        .mockResolvedValue([session]),
    });
    const deps2 = makeDeps();
    const m1 = createLifecycleManager(deps1);
    const m2 = createLifecycleManager(deps2);
    vi.spyOn(m1, "isProcessRunning").mockResolvedValue(true);

    m1.startPidPolling(vi.fn());
    await vi.advanceTimersByTimeAsync(0);

    // m2 was never started, so its deps should not have been called
    expect(deps2.readSessions).not.toHaveBeenCalled();

    m1.stopStaleSessionCleanup();
  });
});
