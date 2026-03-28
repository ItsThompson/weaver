import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { makeOrphanEvent } from "../log-parser/test-helpers";
import { partitionByPid, requireOrphanFile, writeRemaining } from "./helpers";
import { NotFoundError } from "./errors";

beforeEach(() => vi.clearAllMocks());

const orphanLine = (pid: number) => JSON.stringify(makeOrphanEvent(pid));

describe("partitionByPid", () => {
  it("separates matching and non-matching lines", () => {
    const content = `${orphanLine(100)}\n${orphanLine(200)}\n`;
    const result = partitionByPid(content, 100, "test_error");

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].pid).toBe(100);
    expect(result.remainingLines).toHaveLength(1);
    expect(result.remainingLines[0]).toContain('"pid":200');
  });

  it("skips empty lines", () => {
    const content = `${orphanLine(100)}\n\n\n${orphanLine(200)}\n`;
    const result = partitionByPid(content, 100, "test_error");

    expect(result.matched).toHaveLength(1);
    expect(result.remainingLines).toHaveLength(1);
  });

  it("keeps malformed lines in remaining", () => {
    const content = `${orphanLine(100)}\n{bad json\n`;
    const result = partitionByPid(content, 100, "test_error");

    expect(result.matched).toHaveLength(1);
    expect(result.remainingLines).toHaveLength(1);
    expect(result.remainingLines[0]).toBe("{bad json");
  });

  it("treats missing pid as pid 0", () => {
    const noPidLine = JSON.stringify({
      timestamp: "2026-01-01T00:00:00Z",
      event: { hook_event_name: "userPromptSubmit", cwd: "/tmp" },
    });
    const content = `${noPidLine}\n`;
    const result = partitionByPid(content, 0, "test_error");

    expect(result.matched).toHaveLength(1);
    expect(result.remainingLines).toHaveLength(0);
  });

  it("returns all in remaining when no PID matches", () => {
    const content = `${orphanLine(200)}\n${orphanLine(300)}\n`;
    const result = partitionByPid(content, 999, "test_error");

    expect(result.matched).toHaveLength(0);
    expect(result.remainingLines).toHaveLength(2);
  });
});

describe("requireOrphanFile", () => {
  it("returns path when file exists", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(requireOrphanFile()).toContain("orphan.jsonl");
  });

  it("throws NotFoundError when file missing", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(() => requireOrphanFile()).toThrow(NotFoundError);
  });
});

describe("writeRemaining", () => {
  it("writes lines joined with newlines", async () => {
    await writeRemaining("/tmp/test.jsonl", ["line1", "line2"]);
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      "/tmp/test.jsonl.tmp",
      "line1\nline2\n",
      "utf-8",
    );
  });

  it("writes empty string when no lines remain", async () => {
    await writeRemaining("/tmp/test.jsonl", []);
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      "/tmp/test.jsonl.tmp",
      "",
      "utf-8",
    );
  });
});
