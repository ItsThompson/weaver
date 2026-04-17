import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { mkdir, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Harness } from "@weaver/shared/types";
import {
  ensureDataDir,
  readSessions,
  appendSession,
  _sessionCache,
} from "./sessions";

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
      { recursive: true },
    );
    expect(vi.mocked(mkdir)).toHaveBeenCalledWith(
      expect.stringContaining("logs"),
      { recursive: true },
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

  it("deduplicates by session ID, keeping the last entry", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const first = JSON.stringify({
      id: "dup",
      pid: 1,
      customName: null,
      cwd: "/tmp",
      agentName: null,
      startTime: "t1",
      lastEventTime: "t1",
    });
    const other = JSON.stringify({
      id: "unique",
      pid: 2,
      customName: null,
      cwd: "/home",
      agentName: null,
      startTime: "t2",
      lastEventTime: "t2",
    });
    const second = JSON.stringify({
      id: "dup",
      pid: 1,
      customName: null,
      cwd: "/tmp",
      agentName: "dev",
      startTime: "t1",
      lastEventTime: "t3",
    });
    vi.mocked(readFile).mockResolvedValue(`${first}\n${other}\n${second}\n`);

    const sessions = await readSessions();
    expect(sessions).toHaveLength(2);
    // Last entry for "dup" wins (has agentName "dev" and lastEventTime "t3")
    const dupSession = sessions.find((s) => s.id === "dup");
    expect(dupSession?.agentName).toBe("dev");
    expect(dupSession?.lastEventTime).toBe("t3");
    // Unique session is preserved
    expect(sessions.find((s) => s.id === "unique")).toBeDefined();
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
      harness: Harness.KIRO_CLI,
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
