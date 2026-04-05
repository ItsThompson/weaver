import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  readSnippets,
  writeSnippet,
  updateSnippet,
  deleteSnippet,
} from "./snippets";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid"),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readSnippets", () => {
  it("returns [] when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await readSnippets()).toEqual([]);
  });

  it("parses JSONL into Snippet array", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const s1 = JSON.stringify({
      id: "1",
      trigger: "addr",
      expansion: "123 Main St",
    });
    const s2 = JSON.stringify({
      id: "2",
      trigger: "sig",
      expansion: "Best regards",
    });
    vi.mocked(readFile).mockResolvedValue(`${s1}\n${s2}\n`);

    const snippets = await readSnippets();
    expect(snippets).toHaveLength(2);
    expect(snippets[0]).toEqual({
      id: "1",
      trigger: "addr",
      expansion: "123 Main St",
    });
    expect(snippets[1]).toEqual({
      id: "2",
      trigger: "sig",
      expansion: "Best regards",
    });
  });
});

describe("writeSnippet", () => {
  it("appends snippet with generated ID", async () => {
    const result = await writeSnippet({ trigger: "hi", expansion: "hello" });

    expect(result).toEqual({
      id: "test-uuid",
      trigger: "hi",
      expansion: "hello",
    });
    expect(vi.mocked(appendFile)).toHaveBeenCalledWith(
      expect.stringContaining("snippets.jsonl"),
      JSON.stringify({ id: "test-uuid", trigger: "hi", expansion: "hello" }) +
        "\n",
      "utf-8",
    );
  });

  it("generates ID via crypto.randomUUID", async () => {
    await writeSnippet({ trigger: "t", expansion: "e" });
    expect(randomUUID).toHaveBeenCalled();
  });
});

describe("updateSnippet", () => {
  it("replaces the correct snippet by ID", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const s1 = { id: "1", trigger: "old", expansion: "old text" };
    const s2 = { id: "2", trigger: "keep", expansion: "keep text" };
    vi.mocked(readFile).mockResolvedValue(
      `${JSON.stringify(s1)}\n${JSON.stringify(s2)}\n`,
    );

    const result = await updateSnippet("1", {
      trigger: "new",
      expansion: "new text",
    });

    expect(result).toEqual({ id: "1", trigger: "new", expansion: "new text" });
    // Verify atomic write was called (writeFile + rename from mocked fs)
    const { writeFile } = await import("node:fs/promises");
    expect(vi.mocked(writeFile)).toHaveBeenCalled();
  });

  it("returns null when ID not found", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("");

    expect(await updateSnippet("missing", { trigger: "x" })).toBeNull();
  });
});

describe("deleteSnippet", () => {
  it("removes the correct snippet by ID", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const s1 = { id: "1", trigger: "a", expansion: "aa" };
    const s2 = { id: "2", trigger: "b", expansion: "bb" };
    vi.mocked(readFile).mockResolvedValue(
      `${JSON.stringify(s1)}\n${JSON.stringify(s2)}\n`,
    );

    const result = await deleteSnippet("1");

    expect(result).toBe(true);
    const { writeFile } = await import("node:fs/promises");
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("snippets.jsonl"),
      JSON.stringify(s2) + "\n",
      "utf-8",
    );
  });

  it("returns false when ID not found", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("");

    expect(await deleteSnippet("missing")).toBe(false);
  });
});
