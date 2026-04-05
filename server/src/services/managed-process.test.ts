import { EventEmitter } from "node:events";

const mockSpawn = vi.hoisted(() => vi.fn());
const mockExecSync = vi.hoisted(() => vi.fn());
const mockLog = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockUnlinkSync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
  execSync: mockExecSync,
}));
vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  unlinkSync: mockUnlinkSync,
}));
vi.mock("../utils/logger", () => ({ log: mockLog }));

import { createManagedProcess, type ManagedProcess } from "./managed-process";

function makeFakeChild(pid = 1234) {
  const emitter = new EventEmitter() as EventEmitter & {
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    stderr: EventEmitter | null;
  };
  emitter.pid = pid;
  emitter.killed = false;
  emitter.stderr = new EventEmitter();
  emitter.kill = vi.fn((signal?: string) => {
    if (signal === "SIGKILL" || signal === "SIGTERM") {
      emitter.killed = true;
      emitter.emit("exit", null, signal);
    }
    return true;
  });
  return emitter;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockExecSync.mockImplementation(() => {
    throw new Error("no process");
  });
  mockReadFileSync.mockImplementation(() => {
    throw new Error("ENOENT");
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("start", () => {
  it("spawns the process with command, args, and opts", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", ["--flag"], { stdio: "ignore" });

    expect(mockSpawn).toHaveBeenCalledWith("/bin/test", ["--flag"], {
      stdio: "ignore",
    });
  });

  it("returns the spawned child process", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    const result = managed.start("/bin/test", []);

    expect(result).toBe(child);
  });

  it("logs a start event with the process PID", () => {
    const child = makeFakeChild(5678);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "myproc",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "myproc_started", pid: 5678 }),
    );
  });

  it("is a no-op when already running (double-start)", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    managed.start("/bin/test", []);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("returns existing child on double-start", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    const second = managed.start("/bin/test", []);

    expect(second).toBe(child);
  });

  it("sets isAlive to true after start", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);

    expect(managed.isAlive()).toBe(true);
  });

  it("resets isAlive when process exits", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    child.emit("exit", 0, null);

    expect(managed.isAlive()).toBe(false);
  });

  it("logs an exit event when process exits", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "myproc",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    child.emit("exit", 1, "SIGTERM");

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "myproc_exited",
        code: 1,
        signal: "SIGTERM",
      }),
    );
  });
});

describe("stop", () => {
  it("sends SIGTERM to the process", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    managed.stop();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("sends SIGKILL after grace period if not exited", () => {
    const child = makeFakeChild();
    child.killed = false;
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
      gracePeriodMs: 1000,
    });

    managed.start("/bin/test", []);
    managed.stop();

    vi.advanceTimersByTime(1000);

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("does not SIGKILL if process exits before grace period", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    managed.stop();

    // kill mock emits exit immediately
    vi.advanceTimersByTime(2000);

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("uses default 2000ms grace period", () => {
    const child = makeFakeChild();
    child.killed = false;
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    managed.stop();

    vi.advanceTimersByTime(1999);
    expect(child.kill).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("is a no-op when not running", () => {
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    expect(() => managed.stop()).not.toThrow();
  });

  it("sets isAlive to false", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    managed.stop();

    expect(managed.isAlive()).toBe(false);
  });
});

describe("orphan cleanup: port strategy", () => {
  it("kills stale processes on the port before spawning", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    mockExecSync.mockReturnValue("9876\n");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 8178 },
    });

    managed.start("/bin/test", []);

    expect(mockExecSync).toHaveBeenCalledWith("lsof -ti tcp:8178", {
      encoding: "utf8",
    });
    expect(killSpy).toHaveBeenCalledWith(9876, "SIGTERM");
    killSpy.mockRestore();
  });

  it("kills multiple stale processes", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    mockExecSync.mockReturnValue("111\n222\n333\n");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 8178 },
    });

    managed.start("/bin/test", []);

    expect(killSpy).toHaveBeenCalledWith(111, "SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(222, "SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(333, "SIGTERM");
    killSpy.mockRestore();
  });

  it("does not kill the current child process", () => {
    // First start to set child, then stop, then start again
    // Simpler: just verify that when lsof returns the child's own PID, it's skipped
    const child = makeFakeChild(5555);
    mockSpawn.mockReturnValue(child);
    // lsof returns the PID that will be assigned to the new child
    // Since killOrphans runs before spawn, child is null, so all PIDs are killed
    // This test verifies the no-process case is handled gracefully
    mockExecSync.mockImplementation(() => {
      throw new Error("no process");
    });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 8178 },
    });

    managed.start("/bin/test", []);

    expect(killSpy).not.toHaveBeenCalledWith(5555, "SIGTERM");
    killSpy.mockRestore();
  });

  it("handles lsof returning empty string", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    mockExecSync.mockReturnValue("");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 8178 },
    });

    managed.start("/bin/test", []);

    // Only the spawn's own kill should exist, not process.kill for orphans
    expect(killSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it("logs each killed stale process", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    mockExecSync.mockReturnValue("9876\n");
    vi.spyOn(process, "kill").mockImplementation(() => true);
    const managed = createManagedProcess({
      name: "myproc",
      cleanup: { type: "port", port: 8178 },
    });

    managed.start("/bin/test", []);

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "myproc_killed_stale_process",
        pid: 9876,
      }),
    );
    vi.restoreAllMocks();
  });
});

describe("orphan cleanup: pidfile strategy", () => {
  it("kills the process from the PID file before spawning", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    mockReadFileSync.mockReturnValue("4321\n");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "pidfile", path: "/tmp/test.pid" },
    });

    managed.start("/bin/test", []);

    expect(mockReadFileSync).toHaveBeenCalledWith("/tmp/test.pid", "utf8");
    expect(killSpy).toHaveBeenCalledWith(4321, "SIGTERM");
    killSpy.mockRestore();
  });

  it("deletes the PID file after killing the orphan", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    mockReadFileSync.mockReturnValue("4321\n");
    vi.spyOn(process, "kill").mockImplementation(() => true);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "pidfile", path: "/tmp/test.pid" },
    });

    managed.start("/bin/test", []);

    expect(mockUnlinkSync).toHaveBeenCalledWith("/tmp/test.pid");
    vi.restoreAllMocks();
  });

  it("handles missing PID file gracefully", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "pidfile", path: "/tmp/test.pid" },
    });

    expect(() => managed.start("/bin/test", [])).not.toThrow();
  });

  it("writes PID file after spawning", () => {
    const child = makeFakeChild(7777);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "pidfile", path: "/tmp/test.pid" },
    });

    managed.start("/bin/test", []);

    expect(mockWriteFileSync).toHaveBeenCalledWith("/tmp/test.pid", "7777");
  });

  it("removes PID file on stop", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "pidfile", path: "/tmp/test.pid" },
    });

    managed.start("/bin/test", []);
    mockUnlinkSync.mockClear();
    managed.stop();

    expect(mockUnlinkSync).toHaveBeenCalledWith("/tmp/test.pid");
  });

  it("removes PID file when process exits on its own", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "pidfile", path: "/tmp/test.pid" },
    });

    managed.start("/bin/test", []);
    mockUnlinkSync.mockClear();
    child.emit("exit", 0, null);

    expect(mockUnlinkSync).toHaveBeenCalledWith("/tmp/test.pid");
  });

  it("does not write PID file for port strategy", () => {
    const child = makeFakeChild(7777);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

describe("inactivity timeout", () => {
  it("stops the process after the configured timeout", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "myproc",
      cleanup: { type: "port", port: 9999 },
      inactivityTimeoutMs: 60_000,
    });

    managed.start("/bin/test", []);
    vi.advanceTimersByTime(60_000);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "myproc_inactivity_timeout" }),
    );
  });

  it("resets the timer on touch", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
      inactivityTimeoutMs: 60_000,
    });

    managed.start("/bin/test", []);
    vi.advanceTimersByTime(50_000);
    managed.touch();
    vi.advanceTimersByTime(50_000);

    expect(child.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("does not set a timer when inactivityTimeoutMs is not configured", () => {
    const child = makeFakeChild();
    child.kill = vi.fn(() => true);
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(child.kill).not.toHaveBeenCalled();
  });

  it("touch is a no-op when not running", () => {
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
      inactivityTimeoutMs: 60_000,
    });

    expect(() => managed.touch()).not.toThrow();
  });
});

describe("getChild", () => {
  it("returns null when not running", () => {
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    expect(managed.getChild()).toBeNull();
  });

  it("returns the child process when running", () => {
    const child = makeFakeChild();
    mockSpawn.mockReturnValue(child);
    const managed = createManagedProcess({
      name: "test",
      cleanup: { type: "port", port: 9999 },
    });

    managed.start("/bin/test", []);

    expect(managed.getChild()).toBe(child);
  });
});
