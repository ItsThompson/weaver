import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  parseLogFile,
  getLastEvent,
  _logCache,
  createLogParser,
} from "./parse";
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

  it("parses valid JSONL into WeaverEvent array", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const event = makeEvent("agentSpawn");
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(event) + "\n");
    const result = await parseLogFile("test-id");
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe("agentSpawn");
  });

  it("skips malformed lines without crashing", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const valid = JSON.stringify(makeEvent("agentSpawn"));
    vi.mocked(readFile).mockResolvedValue(`${valid}\n{bad json\n`);
    const result = await parseLogFile("test-id");
    expect(result).toHaveLength(1);
  });

  it("skips old-format entries without eventName", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const canonical = JSON.stringify(makeEvent("agentSpawn"));
    const legacy = JSON.stringify({
      timestamp: "2026-01-01T00:00:00Z",
      event: { hook_event_name: "stop", cwd: "/tmp" },
    });
    vi.mocked(readFile).mockResolvedValue(`${canonical}\n${legacy}\n`);
    const result = await parseLogFile("test-id");
    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe("agentSpawn");
  });
});

describe("getLastEvent", () => {
  it("returns null when no events exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await getLastEvent("empty")).toBeNull();
  });

  it("returns the last event with an eventName", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const events = [makeEvent("agentSpawn"), makeEvent("stop")];
    vi.mocked(readFile).mockResolvedValue(
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const result = await getLastEvent("test-id");
    expect(result).toEqual({ name: "stop", timestamp: expect.any(String) });
  });
});

describe("createLogParser", () => {
  it("returns isolated instances with separate caches", async () => {
    const parserA = createLogParser();
    const parserB = createLogParser();

    vi.mocked(existsSync).mockReturnValue(true);
    const event = makeEvent("agentSpawn");
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(event) + "\n");
    vi.mocked(stat).mockResolvedValue({ mtimeMs: 1000, size: 50 } as any);

    await parserA.parseLogFile("shared-id");
    expect(readFile).toHaveBeenCalledTimes(1);

    await parserA.parseLogFile("shared-id");
    expect(readFile).toHaveBeenCalledTimes(1);

    await parserB.parseLogFile("shared-id");
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});
