import { EventEmitter } from "node:events";

const mockSpawn = vi.hoisted(() => vi.fn());
const mockLog = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));
vi.mock("../../utils/logger", () => ({ log: mockLog }));

import {
  startWhisperServer,
  stopWhisperServer,
  isWhisperServerRunning,
  touchWhisperActivity,
  WHISPER_PORT,
} from "./whisper-server";

function makeFakeChild() {
  const emitter = new EventEmitter() as EventEmitter & {
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  emitter.pid = 1234;
  emitter.killed = false;
  emitter.kill = vi.fn((signal?: string) => {
    if (signal === "SIGKILL" || signal === "SIGTERM") {
      emitter.killed = true;
      emitter.emit("exit", null);
    }
    return true;
  });
  return emitter;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Ensure clean state — stop any lingering process
  stopWhisperServer();
});

afterEach(() => {
  stopWhisperServer();
  vi.useRealTimers();
});

describe("WHISPER_PORT", () => {
  it("is 8178", () => {
    expect(WHISPER_PORT).toBe(8178);
  });
});

describe("startWhisperServer", () => {
  it("spawns the binary with correct args", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    startWhisperServer("/usr/bin/whisper", "/models/ggml.bin");

    expect(mockSpawn).toHaveBeenCalledWith("/usr/bin/whisper", [
      "--model",
      "/models/ggml.bin",
      "--port",
      "8178",
      "--host",
      "127.0.0.1",
    ]);
  });

  it("logs the start event", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    startWhisperServer("/bin/whisper", "/model.bin");

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "whisper_server_started", pid: 1234 }),
    );
  });

  it("is a no-op when already running (double-start)", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);

    startWhisperServer("/bin/whisper", "/model.bin");
    startWhisperServer("/bin/whisper", "/model.bin");

    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});

describe("stopWhisperServer", () => {
  it("sends SIGTERM to the process", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);

    startWhisperServer("/bin/whisper", "/model.bin");
    stopWhisperServer();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("sends SIGKILL after 2 seconds if not exited", () => {
    const child = makeFakeChild();
    child.killed = false;
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);

    startWhisperServer("/bin/whisper", "/model.bin");
    stopWhisperServer();

    vi.advanceTimersByTime(2000);

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("does not SIGKILL if process exits before timeout", () => {
    const child = makeFakeChild();
    // kill emits exit and sets killed=true
    mockSpawn.mockReturnValue(child);

    startWhisperServer("/bin/whisper", "/model.bin");
    stopWhisperServer();

    // SIGTERM handler already emitted exit via makeFakeChild's kill mock
    vi.advanceTimersByTime(2000);

    // Only SIGTERM, no SIGKILL
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("is a no-op when not running", () => {
    expect(() => stopWhisperServer()).not.toThrow();
  });
});

describe("isWhisperServerRunning", () => {
  it("returns false when no process is running", async () => {
    expect(await isWhisperServerRunning()).toBe(false);
  });

  it("returns true when process is alive and health check passes", async () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    startWhisperServer("/bin/whisper", "/model.bin");
    const result = await isWhisperServerRunning();

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8178/health");
    vi.unstubAllGlobals();
  });

  it("returns false when health check fails", async () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    startWhisperServer("/bin/whisper", "/model.bin");
    const result = await isWhisperServerRunning();

    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it("returns false when health check throws", async () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    startWhisperServer("/bin/whisper", "/model.bin");
    const result = await isWhisperServerRunning();

    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("inactivity timeout", () => {
  it("kills the process after 5 minutes of inactivity", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);

    startWhisperServer("/bin/whisper", "/model.bin");

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "whisper_inactivity_timeout" }),
    );
  });

  it("resets the timer on touchWhisperActivity", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);

    startWhisperServer("/bin/whisper", "/model.bin");

    // Advance 4 minutes, then touch
    vi.advanceTimersByTime(4 * 60 * 1000);
    touchWhisperActivity();

    // Advance another 4 minutes — should NOT have killed yet
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(child.kill).not.toHaveBeenCalled();

    // Advance the remaining 1 minute to hit 5 min from last touch
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("touchWhisperActivity is a no-op when not running", () => {
    expect(() => touchWhisperActivity()).not.toThrow();
  });
});
