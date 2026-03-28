import type { Session } from "@weaver/shared/types";

const {
  mockReadSessions,
  mockIsProcessRunning,
  mockGetLastEvent,
  mockLog,
  mockExecFile,
} = vi.hoisted(() => ({
  mockReadSessions: vi.fn<() => Promise<Session[]>>(),
  mockIsProcessRunning: vi.fn<(pid: number) => Promise<boolean>>(),
  mockGetLastEvent:
    vi.fn<() => Promise<{ name: string; timestamp: string } | null>>(),
  mockLog: vi.fn(),
  mockExecFile: vi.fn(),
}));

vi.mock("./storage/index", () => ({
  readSessions: mockReadSessions,
  isProcessRunning: mockIsProcessRunning,
}));

vi.mock("./log-parser/index", async () => {
  const actual = await vi.importActual("./log-parser/index");
  return {
    ...actual,
    getLastEvent: mockGetLastEvent,
  };
});

vi.mock("../utils/logger", () => ({ log: mockLog }));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

import { startKeepAwake, stopKeepAwake } from "./keep-awake";
import { createKeepAwake } from "./keep-awake";
import type { KeepAwakeDeps } from "./keep-awake";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    pid: 100,
    customName: null,
    cwd: "/tmp",
    agentName: null,
    startTime: "2026-01-01T00:00:00Z",
    lastEventTime: "2026-01-01T00:01:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockReadSessions.mockResolvedValue([]);
  stopKeepAwake();
});

afterEach(() => {
  stopKeepAwake();
  vi.useRealTimers();
});

const FAKE_SCRIPT = "/tmp/keep-awake.sh";

describe("startKeepAwake", () => {
  it("polls immediately on start", async () => {
    startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockReadSessions).toHaveBeenCalledTimes(1);
  });

  it("runs the keep-awake script when an active session exists", async () => {
    mockReadSessions.mockResolvedValue([makeSession()]);
    mockIsProcessRunning.mockResolvedValue(true);
    mockGetLastEvent.mockResolvedValue({
      name: "preToolUse",
      timestamp: new Date().toISOString(),
    });

    startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockExecFile).toHaveBeenCalledWith(
      "bash",
      [FAKE_SCRIPT],
      expect.any(Function),
    );
  });

  it("does not run the script when no sessions are active", async () => {
    mockReadSessions.mockResolvedValue([makeSession()]);
    mockIsProcessRunning.mockResolvedValue(true);
    mockGetLastEvent.mockResolvedValue({ name: "stop", timestamp: "" });

    startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("skips sessions where the process is not running", async () => {
    mockReadSessions.mockResolvedValue([makeSession()]);
    mockIsProcessRunning.mockResolvedValue(false);

    startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockGetLastEvent).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("logs and swallows poll errors", async () => {
    mockReadSessions.mockRejectedValue(new Error("disk full"));

    startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "keep_awake_poll_error" }),
    );
  });

  it("logs execFile callback errors", async () => {
    mockReadSessions.mockResolvedValue([makeSession()]);
    mockIsProcessRunning.mockResolvedValue(true);
    mockGetLastEvent.mockResolvedValue({
      name: "userPromptSubmit",
      timestamp: "",
    });
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[2] as (err: Error | null) => void;
      cb(new Error("script failed"));
    });

    startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "keep_awake_error" }),
    );
  });
});

describe("stopKeepAwake", () => {
  it("stops the polling interval", async () => {
    startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);
    mockReadSessions.mockClear();

    stopKeepAwake();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockReadSessions).not.toHaveBeenCalled();
  });

  it("is safe to call when not started", () => {
    expect(() => stopKeepAwake()).not.toThrow();
  });
});

describe("createKeepAwake (factory)", () => {
  function makeDeps(overrides: Partial<KeepAwakeDeps> = {}): KeepAwakeDeps {
    return {
      readSessions: vi.fn<() => Promise<Session[]>>().mockResolvedValue([]),
      isProcessRunning: vi
        .fn<(pid: number) => Promise<boolean>>()
        .mockResolvedValue(false),
      getLastEvent: vi.fn().mockResolvedValue(null),
      deriveActivity: vi.fn().mockReturnValue("idle"),
      log: vi.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes script when active sessions exist", async () => {
    const deps = makeDeps({
      readSessions: vi.fn().mockResolvedValue([makeSession()]),
      isProcessRunning: vi.fn().mockResolvedValue(true),
      deriveActivity: vi.fn().mockReturnValue("processing"),
    });
    const ka = createKeepAwake(deps);

    ka.startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockExecFile).toHaveBeenCalledWith(
      "bash",
      [FAKE_SCRIPT],
      expect.any(Function),
    );
    ka.stopKeepAwake();
  });

  it("does not execute script when no active sessions", async () => {
    const deps = makeDeps({
      readSessions: vi.fn().mockResolvedValue([makeSession()]),
      isProcessRunning: vi.fn().mockResolvedValue(true),
      deriveActivity: vi.fn().mockReturnValue("idle"),
    });
    const ka = createKeepAwake(deps);

    ka.startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockExecFile).not.toHaveBeenCalled();
    ka.stopKeepAwake();
  });

  it("clears interval when stopKeepAwake is called", async () => {
    const deps = makeDeps();
    const ka = createKeepAwake(deps);

    ka.startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(deps.readSessions).mockClear();

    ka.stopKeepAwake();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(deps.readSessions).not.toHaveBeenCalled();
  });

  it("returns isolated instances", async () => {
    const depsA = makeDeps();
    const depsB = makeDeps();
    const kaA = createKeepAwake(depsA);
    const kaB = createKeepAwake(depsB);

    kaA.startKeepAwake(FAKE_SCRIPT);
    await vi.advanceTimersByTimeAsync(0);

    expect(depsA.readSessions).toHaveBeenCalled();
    expect(depsB.readSessions).not.toHaveBeenCalled();

    kaA.stopKeepAwake();
    kaB.stopKeepAwake();
  });
});
