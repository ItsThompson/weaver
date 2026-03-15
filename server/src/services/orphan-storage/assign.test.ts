import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { makeOrphanEvent } from "../log-parser/test-helpers";
import { assignOrphanEvents } from "./assign";
import { NotFoundError } from "./errors";

beforeEach(() => vi.clearAllMocks());

const orphanLine = (pid: number) => JSON.stringify(makeOrphanEvent(pid));

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
  });

  it("strips pid from moved events", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(`${orphanLine(100)}\n`);

    await assignOrphanEvents("aaa", 100);

    const appendedContent = vi.mocked(appendFile).mock.calls[0][1] as string;
    const parsed = JSON.parse(appendedContent.trim());
    expect(parsed.pid).toBeUndefined();
  });

  it("throws NotFoundError when no orphan file", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await expect(assignOrphanEvents("aaa", 100)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when target log missing", async () => {
    vi.mocked(existsSync).mockImplementation((path: any) =>
      String(path).includes("orphan.jsonl"),
    );
    await expect(assignOrphanEvents("aaa", 100)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when no events match PID", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(`${orphanLine(200)}\n`);
    await expect(assignOrphanEvents("aaa", 999)).rejects.toThrow(NotFoundError);
  });
});
