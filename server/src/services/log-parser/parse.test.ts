import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseLogFile, getLastEvent, _logCache } from "./parse";
import { makeEvent } from "./test-helpers";

beforeEach(() => {
  vi.clearAllMocks();
  _logCache.clear();
});

describe("parseLogFile", () => {
  it("returns empty array when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await parseLogFile("missing")).toEqual([]);
  });

  it("parses valid JSONL into HookEvent array", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const event = makeEvent("agentSpawn");
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(event) + "\n");
    const result = await parseLogFile("test-id");
    expect(result).toHaveLength(1);
    expect(result[0].event.hook_event_name).toBe("agentSpawn");
  });

  it("skips malformed lines without crashing", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const valid = JSON.stringify(makeEvent("agentSpawn"));
    vi.mocked(readFile).mockResolvedValue(`${valid}\n{bad json\n`);
    const result = await parseLogFile("test-id");
    expect(result).toHaveLength(1);
  });
});

describe("getLastEvent", () => {
  it("returns null when no events exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await getLastEvent("empty")).toBeNull();
  });

  it("returns the last event with a hook_event_name", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const events = [makeEvent("agentSpawn"), makeEvent("stop")];
    vi.mocked(readFile).mockResolvedValue(
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const result = await getLastEvent("test-id");
    expect(result).toEqual({ name: "stop", timestamp: expect.any(String) });
  });
});
