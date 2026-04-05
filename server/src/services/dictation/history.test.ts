import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { appendFile, mkdir } from "node:fs/promises";
import { logDictation } from "./history";

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
