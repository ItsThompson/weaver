import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { writeFile, rename, unlink } from "node:fs/promises";
import { atomicWriteFile } from "./atomic-write";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("atomicWriteFile", () => {
  it("writes to a .tmp file then renames to the target path", async () => {
    await atomicWriteFile("/data/sessions.jsonl", "content");

    expect(writeFile).toHaveBeenCalledWith(
      "/data/sessions.jsonl.tmp",
      "content",
      "utf-8",
    );
    expect(rename).toHaveBeenCalledWith(
      "/data/sessions.jsonl.tmp",
      "/data/sessions.jsonl",
    );
  });

  it("calls writeFile before rename", async () => {
    const order: string[] = [];
    vi.mocked(writeFile).mockImplementation(async () => {
      order.push("write");
    });
    vi.mocked(rename).mockImplementation(async () => {
      order.push("rename");
    });

    await atomicWriteFile("/data/file.json", "data");

    expect(order).toEqual(["write", "rename"]);
  });

  it("propagates writeFile errors without calling rename", async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error("disk full"));

    await expect(atomicWriteFile("/data/file.json", "x")).rejects.toThrow(
      "disk full",
    );
    expect(rename).not.toHaveBeenCalled();
  });

  it("propagates rename errors and cleans up tmp file", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(rename).mockRejectedValue(new Error("permission denied"));

    await expect(atomicWriteFile("/data/file.json", "x")).rejects.toThrow(
      "permission denied",
    );
    expect(unlink).toHaveBeenCalledWith("/data/file.json.tmp");
  });
});
