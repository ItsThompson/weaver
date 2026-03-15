import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

vi.mock("../log-parser/index", () => ({
  groupEventsByTurn: vi.fn().mockReturnValue([]),
}));

vi.mock("../file-cache/index", async () => {
  const actual = await vi.importActual<typeof import("../file-cache/index")>(
    "../file-cache/index",
  );
  return actual;
});

import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { makeOrphanEvent } from "../log-parser/test-helpers";
import {
  readOrphanEvents,
  groupByPid,
  assignOrphanEvents,
  deleteOrphanEvents,
  NotFoundError,
} from "./orphan-storage";

beforeEach(() => vi.clearAllMocks());

const orphanLine = (pid: number, eventName = "userPromptSubmit") =>
  JSON.stringify(makeOrphanEvent(pid, eventName));

describe("readOrphanEvents", () => {
  it("returns empty array when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await readOrphanEvents()).toEqual([]);
  });

  it("parses valid JSONL into events", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(`${orphanLine(100)}\n`);
    const events = await readOrphanEvents();
    expect(events).toHaveLength(1);
    expect(events[0].pid).toBe(100);
  });

  it("skips malformed lines", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(`${orphanLine(100)}\n{bad json\n`);
    const events = await readOrphanEvents();
    expect(events).toHaveLength(1);
  });
});

describe("groupByPid", () => {
  it("groups events by PID", () => {
    const events = [
      makeOrphanEvent(100),
      makeOrphanEvent(100),
      makeOrphanEvent(200),
    ];
    const groups = groupByPid(events);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.pid === 100)?.eventCount).toBe(2);
    expect(groups.find((group) => group.pid === 200)?.eventCount).toBe(1);
  });
});

describe("assignOrphanEvents", () => {
  it("moves matching events to target log", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      `${orphanLine(100)}\n${orphanLine(200)}\n`,
    );

    const result = await assignOrphanEvents("aaa", 100);

    expect(result.movedCount).toBe(1);
    expect(vi.mocked(appendFile)).toHaveBeenCalledWith(
      expect.stringContaining("aaa.jsonl"),
      expect.any(String),
    );
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("orphan.jsonl"),
      expect.stringContaining('"pid":200'),
    );
  });

  it("throws NotFoundError when no orphan file", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await expect(assignOrphanEvents("aaa", 100)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when no events match PID", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(`${orphanLine(200)}\n`);
    await expect(assignOrphanEvents("aaa", 999)).rejects.toThrow(NotFoundError);
  });
});

describe("deleteOrphanEvents", () => {
  it("removes matching events and rewrites file", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      `${orphanLine(100)}\n${orphanLine(200)}\n`,
    );

    const result = await deleteOrphanEvents(100);

    expect(result.deletedCount).toBe(1);
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("orphan.jsonl"),
      expect.stringContaining('"pid":200'),
    );
  });

  it("throws NotFoundError when no orphan file", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await expect(deleteOrphanEvents(100)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when no events match PID", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(`${orphanLine(200)}\n`);
    await expect(deleteOrphanEvents(999)).rejects.toThrow(NotFoundError);
  });
});
