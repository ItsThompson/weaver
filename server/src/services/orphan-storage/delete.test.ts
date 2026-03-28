import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { makeOrphanEvent } from "../log-parser/test-helpers";
import { deleteOrphanEvents } from "./delete";
import { NotFoundError } from "./errors";

beforeEach(() => vi.clearAllMocks());

const orphanLine = (pid: number) => JSON.stringify(makeOrphanEvent(pid));

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
      "utf-8",
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
