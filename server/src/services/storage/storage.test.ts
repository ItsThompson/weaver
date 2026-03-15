import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/child-process";
import "../../__tests__/mocks/logger";

import { mkdir, readFile, appendFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  ensureDataDir,
  readSessions,
  appendSession,
  cleanStaleSessions,
  isProcessRunning,
  _sessionCache,
} from "./storage";

beforeEach(() => {
  vi.clearAllMocks();
  _sessionCache.clear();
});

describe("ensureDataDir", () => {
  it("creates data and logs directories", async () => {
    await ensureDataDir();
    expect(vi.mocked(mkdir)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mkdir)).toHaveBeenCalledWith(
      expect.stringContaining(".weaver"),
      {
        recursive: true,
      },
    );
    expect(vi.mocked(mkdir)).toHaveBeenCalledWith(
      expect.stringContaining("logs"),
      {
        recursive: true,
      },
    );
  });

  it("throws when directory creation fails", async () => {
    vi.mocked(mkdir).mockRejectedValueOnce(new Error("permission denied"));
    await expect(ensureDataDir()).rejects.toThrow("permission denied");
  });
});

describe("readSessions", () => {
  it("returns empty array when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const sessions = await readSessions();
    expect(sessions).toEqual([]);
  });

  it("parses JSONL into Session array", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const line1 = JSON.stringify({
      id: "a",
      pid: 1,
      customName: null,
      cwd: "/tmp",
      agentName: null,
      startTime: "t1",
      lastEventTime: "t1",
    });
    const line2 = JSON.stringify({
      id: "b",
      pid: 2,
      customName: "test",
      cwd: "/home",
      agentName: "dev",
      startTime: "t2",
      lastEventTime: "t2",
    });
    vi.mocked(readFile).mockResolvedValue(`${line1}\n${line2}\n`);

    const sessions = await readSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("a");
    expect(sessions[1].id).toBe("b");
  });

  it("skips malformed lines gracefully", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const valid = JSON.stringify({
      id: "a",
      pid: 1,
      customName: null,
      cwd: "/tmp",
      agentName: null,
      startTime: "t1",
      lastEventTime: "t1",
    });
    vi.mocked(readFile).mockResolvedValue(`${valid}\n{bad json\n`);

    const sessions = await readSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("a");
  });
});

describe("appendSession", () => {
  it("appends JSON line to sessions file", async () => {
    const session = {
      id: "a",
      pid: 1,
      customName: null,
      cwd: "/tmp",
      agentName: null,
      startTime: "t1",
      lastEventTime: "t1",
    };
    await appendSession(session);
    expect(vi.mocked(appendFile)).toHaveBeenCalledWith(
      expect.stringContaining("sessions.jsonl"),
      JSON.stringify(session) + "\n",
      "utf-8",
    );
  });
});

describe("cleanStaleSessions", () => {
  it("deletes marker files for dead PIDs", async () => {
    // Use a PID that is almost certainly not running
    const deadPid = 999999;
    vi.mocked(readdir).mockResolvedValue([
      `.current-session-${deadPid}`,
    ] as any);

    await cleanStaleSessions();
    expect(vi.mocked(unlink)).toHaveBeenCalledWith(
      expect.stringContaining(`.current-session-${deadPid}`),
    );
  });

  it("leaves marker files for live PIDs", async () => {
    // Use current process PID which is guaranteed to be running and signalable
    const livePid = process.pid;
    vi.mocked(readdir).mockResolvedValue([
      `.current-session-${livePid}`,
    ] as any);
    vi.mocked(execFileSync).mockReturnValue(`/path/to/kiro-cli chat\n`);

    await cleanStaleSessions();
    expect(vi.mocked(unlink)).not.toHaveBeenCalled();
  });

  it("skips files with non-numeric PID suffixes", async () => {
    vi.mocked(readdir).mockResolvedValue([".current-session-abc"] as any);

    await cleanStaleSessions();
    expect(vi.mocked(unlink)).not.toHaveBeenCalled();
  });

  it("handles readdir failure gracefully", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("no such directory"));

    await expect(cleanStaleSessions()).resolves.toBeUndefined();
  });
});

describe("isProcessRunning", () => {
  it("returns true for a running kiro-cli process", () => {
    vi.mocked(execFileSync).mockReturnValue(
      `/path/to/kiro-cli chat --agent dev\n`,
    );
    expect(isProcessRunning(process.pid)).toBe(true);
  });

  it("returns false for a non-existent process", () => {
    expect(isProcessRunning(999999)).toBe(false);
  });

  it("returns false when PID is alive but not kiro-cli (PID reuse)", () => {
    vi.mocked(execFileSync).mockReturnValue(`/usr/bin/some-other-process\n`);
    expect(isProcessRunning(process.pid)).toBe(false);
  });
});
