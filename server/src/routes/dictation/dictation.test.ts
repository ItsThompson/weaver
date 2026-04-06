import type { ServicesStatusResponse } from "@weaver/shared/types";

const mockGetStatus = vi.fn<() => Promise<ServicesStatusResponse>>();

vi.mock("../../services/dictation/index", () => ({
  WHISPER_PORT: 8178,
  generateText: vi.fn(),
  logDictation: vi.fn(),
  readDictationHistory: vi.fn(),
  AVAILABLE_MODELS: [
    {
      name: "Tiny (English)",
      size: "75 MB",
      filename: "ggml-tiny.en.bin",
      url: "https://example.com/ggml-tiny.en.bin",
    },
  ],
  downloadModel: vi.fn(),
  listLocalModels: vi.fn(),
}));

vi.mock("../../services/config/index", () => ({
  readConfig: vi.fn(),
}));

vi.mock("../../services/service-manager-instance", () => ({
  serviceManager: { getStatus: (...args: unknown[]) => mockGetStatus(...args) },
}));

import Fastify from "fastify";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import { registerDictationRoutes } from "./dictation";
import {
  generateText,
  logDictation,
  readDictationHistory,
  downloadModel,
  listLocalModels,
} from "../../services/dictation/index";
import { readConfig } from "../../services/config/index";

const runningStatus: ServicesStatusResponse = {
  ready: true,
  services: {
    whisper: { state: "running" },
    ollama: { state: "running" },
  },
};

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(readConfig).mockResolvedValue({
    config: { ...DEFAULT_CONFIG },
    warnings: [],
  });
  mockGetStatus.mockResolvedValue(runningStatus);
  server = Fastify();
  registerDictationRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe("POST /api/dictation/transcribe", () => {
  it("proxies audio to whisper when service is running", async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ text: "hello world" }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/transcribe",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("fake wav data"),
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.text).toBe("hello world");

    vi.unstubAllGlobals();
  });

  it("returns 503 when whisper is not running", async () => {
    mockGetStatus.mockResolvedValue({
      ready: true,
      services: {
        whisper: { state: "error", error: "Whisper failed to start" },
        ollama: { state: "running" },
      },
    });

    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/transcribe",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("fake wav data"),
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toBe(
      "Whisper is not available. Check service status.",
    );
  });
});

describe("POST /api/dictation/process", () => {
  it("returns snippet expansion when transcript matches a snippet", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/process",
      payload: {
        transcript: "my email",
        snippets: [
          { id: "1", trigger: "my email", expansion: "user@example.com" },
        ],
      },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.processedText).toBe("user@example.com");
    expect(body.snippetUsed).toBe("my email");
    expect(logDictation).toHaveBeenCalled();
  });

  it("returns Ollama-cleaned text when no snippet matches", async () => {
    vi.mocked(generateText).mockResolvedValue("Hello, how are you?");

    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/process",
      payload: {
        transcript: "uh hello how are you",
        snippets: [],
      },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.processedText).toBe("Hello, how are you?");
    expect(body.snippetUsed).toBeNull();
    expect(generateText).toHaveBeenCalled();
    expect(logDictation).toHaveBeenCalled();
  });

  it("returns 503 when ollama is not running and llm_cleanup is true", async () => {
    mockGetStatus.mockResolvedValue({
      ready: true,
      services: {
        whisper: { state: "running" },
        ollama: { state: "error", error: "Ollama not found" },
      },
    });

    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/process",
      payload: {
        transcript: "hello world",
        snippets: [],
      },
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toBe(
      "Ollama is not available. Check service status.",
    );
  });

  it("skips ollama check when llm_cleanup is false", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: {
        ...DEFAULT_CONFIG,
        dictation: { ...DEFAULT_CONFIG.dictation, llm_cleanup: false },
      },
      warnings: [],
    });

    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/process",
      payload: {
        transcript: "hello world",
        snippets: [],
      },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.processedText).toBe("hello world");
    expect(mockGetStatus).not.toHaveBeenCalledTimes(2); // only called once for initial setup, not for ollama check
  });

  it("returns 500 when LLM processing fails", async () => {
    vi.mocked(generateText).mockRejectedValue(
      new Error("Ollama error: 404 Not Found"),
    );

    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/process",
      payload: {
        transcript: "hello world",
        snippets: [],
      },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(500);
    expect(body.error).toBe("Ollama error: 404 Not Found");
  });

  it("returns 400 when transcript is missing", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/process",
      payload: { snippets: [] },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/dictation/models", () => {
  it("returns available and local models", async () => {
    vi.mocked(listLocalModels).mockResolvedValue(["ggml-tiny.en.bin"]);

    const res = await server.inject({
      method: "GET",
      url: "/api/dictation/models",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.available).toHaveLength(1);
    expect(body.local).toEqual(["ggml-tiny.en.bin"]);
  });
});

describe("POST /api/dictation/models/download", () => {
  it("streams progress and completes download", async () => {
    vi.mocked(downloadModel).mockImplementation(async (_model, onProgress) => {
      onProgress(50);
      onProgress(100);
    });

    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/models/download",
      payload: { filename: "ggml-tiny.en.bin" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"progress":50');
    expect(res.body).toContain('"progress":100');
    expect(res.body).toContain('"complete":true');
  });

  it("returns 400 for unknown model", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/models/download",
      payload: { filename: "unknown.bin" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/dictation/history", () => {
  it("returns entries from readDictationHistory", async () => {
    const entries = [
      {
        timestamp: "2026-04-05T18:01:00.000Z",
        rawTranscript: "second",
        processedText: "Second.",
      },
    ];
    vi.mocked(readDictationHistory).mockResolvedValue(entries);

    const res = await server.inject({
      method: "GET",
      url: "/api/dictation/history",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.entries).toEqual(entries);
  });
});
