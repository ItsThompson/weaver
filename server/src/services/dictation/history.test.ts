import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { logDictation, readDictationHistory } from "./history";

beforeEach(() => {
  vi.clearAllMocks();
});

const entry = {
  timestamp: "2026-04-05T18:00:00.000Z",
  rawTranscript: "hello world",
  processedText: "Hello, world.",
};

describe("logDictation", () => {
  it("appends a JSON line to the dictations file", async () => {
    await logDictation(entry);

    expect(mkdir).toHaveBeenCalledWith(expect.any(String), {
      recursive: true,
    });
    expect(appendFile).toHaveBeenCalledWith(
      expect.stringContaining("dictations.jsonl"),
      JSON.stringify(entry) + "\n",
      "utf-8",
    );
  });

  it("appends multiple entries as separate lines", async () => {
    const entry2 = {
      timestamp: "2026-04-05T18:01:00.000Z",
      rawTranscript: "second entry",
      processedText: "Second entry.",
    };

    await logDictation(entry);
    await logDictation(entry2);

    expect(appendFile).toHaveBeenCalledTimes(2);
    expect(appendFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("dictations.jsonl"),
      JSON.stringify(entry) + "\n",
      "utf-8",
    );
    expect(appendFile).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("dictations.jsonl"),
      JSON.stringify(entry2) + "\n",
      "utf-8",
    );
  });
});

describe("readDictationHistory", () => {
  it("returns entries in reverse chronological order", async () => {
    const entry1 = {
      timestamp: "2026-04-05T18:00:00.000Z",
      rawTranscript: "first",
      processedText: "First.",
    };
    const entry2 = {
      timestamp: "2026-04-05T18:01:00.000Z",
      rawTranscript: "second",
      processedText: "Second.",
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify(entry1) + "\n" + JSON.stringify(entry2) + "\n",
    );

    const result = await readDictationHistory();

    expect(result).toEqual([entry2, entry1]);
  });

  it("returns empty array when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await readDictationHistory();

    expect(result).toEqual([]);
  });

  it("skips malformed lines", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify(entry) + "\n" + "not json\n",
    );

    const result = await readDictationHistory();

    expect(result).toEqual([entry]);
  });
});
