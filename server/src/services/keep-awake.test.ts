import { jest } from "@jest/globals";
import type { Session } from "@weaver/shared/types";

const mockReadSessions = jest.fn<() => Promise<Session[]>>();
const mockIsProcessRunning = jest.fn<(pid: number) => boolean>();
const mockGetLastEvent =
  jest.fn<() => Promise<{ name: string; timestamp: string } | null>>();
const mockDeriveActivity = jest.fn<(name: string) => string>();
const mockLog = jest.fn();
const mockExecFile = jest.fn();

jest.unstable_mockModule("./storage/index", () => ({
  readSessions: mockReadSessions,
  isProcessRunning: mockIsProcessRunning,
}));

jest.unstable_mockModule("./log-parser/index", () => ({
  getLastEvent: mockGetLastEvent,
  deriveActivity: mockDeriveActivity,
}));

jest.unstable_mockModule("../utils/logger", () => ({ log: mockLog }));

jest.unstable_mockModule("node:child_process", () => ({
  execFile: mockExecFile,
}));

const { startKeepAwake, stopKeepAwake } = await import("./keep-awake");

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
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockReadSessions.mockResolvedValue([]);
  stopKeepAwake();
});

afterEach(() => {
  stopKeepAwake();
  jest.useRealTimers();
});

describe("startKeepAwake", () => {
  it("polls immediately on start", async () => {
    startKeepAwake();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockReadSessions).toHaveBeenCalledTimes(1);
  });

  it("runs the keep-awake script when an active session exists", async () => {
    mockReadSessions.mockResolvedValue([makeSession()]);
    mockIsProcessRunning.mockReturnValue(true);
    mockGetLastEvent.mockResolvedValue({
      name: "preToolUse",
      timestamp: new Date().toISOString(),
    });
    mockDeriveActivity.mockReturnValue("running_tool");

    startKeepAwake();
    await jest.advanceTimersByTimeAsync(0);

    expect(mockExecFile).toHaveBeenCalledWith(
      "bash",
      [expect.stringContaining("keep-awake.sh")],
      expect.any(Function),
    );
  });

  it("does not run the script when no sessions are active", async () => {
    mockReadSessions.mockResolvedValue([makeSession()]);
    mockIsProcessRunning.mockReturnValue(true);
    mockGetLastEvent.mockResolvedValue({ name: "stop", timestamp: "" });
    mockDeriveActivity.mockReturnValue("idle");

    startKeepAwake();
    await jest.advanceTimersByTimeAsync(0);

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("skips sessions where the process is not running", async () => {
    mockReadSessions.mockResolvedValue([makeSession()]);
    mockIsProcessRunning.mockReturnValue(false);

    startKeepAwake();
    await jest.advanceTimersByTimeAsync(0);

    expect(mockGetLastEvent).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("logs and swallows poll errors", async () => {
    mockReadSessions.mockRejectedValue(new Error("disk full"));

    startKeepAwake();
    await jest.advanceTimersByTimeAsync(0);

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "keep_awake_poll_error" }),
    );
  });

  it("logs execFile callback errors", async () => {
    mockReadSessions.mockResolvedValue([makeSession()]);
    mockIsProcessRunning.mockReturnValue(true);
    mockGetLastEvent.mockResolvedValue({
      name: "userPromptSubmit",
      timestamp: "",
    });
    mockDeriveActivity.mockReturnValue("processing");
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[2] as (err: Error | null) => void;
      cb(new Error("script failed"));
    });

    startKeepAwake();
    await jest.advanceTimersByTimeAsync(0);

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "keep_awake_error" }),
    );
  });
});

describe("stopKeepAwake", () => {
  it("stops the polling interval", async () => {
    startKeepAwake();
    await jest.advanceTimersByTimeAsync(0);
    mockReadSessions.mockClear();

    stopKeepAwake();
    await jest.advanceTimersByTimeAsync(120_000);

    expect(mockReadSessions).not.toHaveBeenCalled();
  });

  it("is safe to call when not started", () => {
    expect(() => stopKeepAwake()).not.toThrow();
  });
});
