import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import {
  mkdir,
  writeFile,
  readdir,
  unlink,
  rename,
  stat,
} from "node:fs/promises";
import {
  downloadModel,
  listLocalModels,
  getDefaultModelPath,
  AVAILABLE_MODELS,
} from "./model-download";
import type { WhisperModel } from "@weaver/shared/types";

const model: WhisperModel = AVAILABLE_MODELS[0];

function mockFetchResponse(chunks: Uint8Array[], total: number) {
  let callIndex = 0;
  const reader = {
    read: vi.fn(() => {
      if (callIndex < chunks.length) {
        return Promise.resolve({ done: false, value: chunks[callIndex++] });
      }
      return Promise.resolve({ done: true, value: undefined });
    }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) => (h === "content-length" ? String(total) : null),
      },
      body: { getReader: () => reader },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // stat rejects by default (file doesn't exist) — already set in fs mock
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadModel", () => {
  it("creates directory and downloads file when models dir does not exist", async () => {
    const chunk = new Uint8Array([1, 2, 3]);
    mockFetchResponse([chunk], 3);
    const onProgress = vi.fn();

    await downloadModel(model, onProgress);

    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining("models"), {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("ggml-tiny.en.bin.tmp"),
      Buffer.concat([chunk]),
    );
    expect(rename).toHaveBeenCalledWith(
      expect.stringContaining("ggml-tiny.en.bin.tmp"),
      expect.stringContaining("ggml-tiny.en.bin"),
    );
  });

  it("calls onProgress with percentage as chunks arrive", async () => {
    const c1 = new Uint8Array([1, 2]);
    const c2 = new Uint8Array([3, 4, 5]);
    mockFetchResponse([c1, c2], 5);
    const onProgress = vi.fn();

    await downloadModel(model, onProgress);

    expect(onProgress).toHaveBeenCalledWith(40); // 2/5 = 40%
    expect(onProgress).toHaveBeenCalledWith(100); // 5/5 = 100%
  });

  it("skips download when model file already exists", async () => {
    vi.mocked(stat).mockResolvedValueOnce({ mtimeMs: 0 } as never);
    vi.stubGlobal("fetch", vi.fn());
    const onProgress = vi.fn();

    await downloadModel(model, onProgress);

    expect(fetch).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("cleans up partial file and throws on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    const onProgress = vi.fn();

    await expect(downloadModel(model, onProgress)).rejects.toThrow(
      "Download failed: ECONNREFUSED",
    );
  });

  it("cleans up partial file and throws on read error", async () => {
    let callIndex = 0;
    const reader = {
      read: vi.fn(() => {
        if (callIndex++ === 0) {
          return Promise.resolve({ done: false, value: new Uint8Array([1]) });
        }
        return Promise.reject(new Error("stream interrupted"));
      }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "100" },
        body: { getReader: () => reader },
      }),
    );
    const onProgress = vi.fn();

    await expect(downloadModel(model, onProgress)).rejects.toThrow(
      "stream interrupted",
    );
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining(".tmp"));
  });
});

describe("listLocalModels", () => {
  it("returns .bin filenames from models directory", async () => {
    vi.mocked(readdir).mockResolvedValue([
      "ggml-tiny.en.bin",
      "readme.txt",
    ] as never);

    const result = await listLocalModels();

    expect(result).toEqual(["ggml-tiny.en.bin"]);
  });

  it("returns empty array when directory does not exist", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));

    const result = await listLocalModels();

    expect(result).toEqual([]);
  });
});

describe("getDefaultModelPath", () => {
  it("returns path to first available model", async () => {
    vi.mocked(readdir).mockResolvedValue(["ggml-tiny.en.bin"] as never);

    const result = await getDefaultModelPath();

    expect(result).toContain("models");
    expect(result).toContain("ggml-tiny.en.bin");
  });

  it("returns null when no models exist", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));

    const result = await getDefaultModelPath();

    expect(result).toBeNull();
  });
});
