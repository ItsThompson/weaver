import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

vi.mock("../file-cache/index", async () => {
  const actual = await vi.importActual<typeof import("../file-cache/index")>(
    "../file-cache/index",
  );
  return actual;
});

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { makeOrphanEvent } from "../log-parser/test-helpers";
import { readOrphanEvents, groupByPid } from "./read";

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
