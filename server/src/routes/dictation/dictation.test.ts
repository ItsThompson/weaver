vi.mock("../../services/dictation/index", () => ({
  WHISPER_PORT: 8178,
  isWhisperServerRunning: vi.fn(),
  startWhisperServer: vi.fn(),
  stopWhisperServer: vi.fn(),
  waitForWhisperReady: vi.fn(),
  touchWhisperActivity: vi.fn(),
  checkOllamaHealth: vi.fn(),
  ensureOllamaRunning: vi.fn(),
  generateText: vi.fn(),
  logDictation: vi.fn(),
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
  getDefaultModelPath: vi.fn(),
  stopOllamaServer: vi.fn(),
}));

vi.mock("../../services/config/index", () => ({
  readConfig: vi.fn(),
}));

import Fastify from "fastify";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import { registerDictationRoutes } from "./dictation";
import {
  isWhisperServerRunning,
  checkOllamaHealth,
  ensureOllamaRunning,
  generateText,
  logDictation,
  startWhisperServer,
  waitForWhisperReady,
  touchWhisperActivity,
  downloadModel,
  listLocalModels,
  getDefaultModelPath,
} from "../../services/dictation/index";
import { readConfig } from "../../services/config/index";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(readConfig).mockResolvedValue({
    config: { ...DEFAULT_CONFIG },
    warnings: [],
  });
  server = Fastify();
  registerDictationRoutes(server, "/usr/bin/whisper");
  await server.ready();
});

afterEach(() => server.close());

describe("GET /api/dictation/status", () => {
  it("returns both true when whisper and ollama are running", async () => {
    vi.mocked(isWhisperServerRunning).mockResolvedValue(true);
    vi.mocked(ensureOllamaRunning).mockResolvedValue(true);
    vi.mocked(getDefaultModelPath).mockResolvedValue(
      "/models/ggml-tiny.en.bin",
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/dictation/status",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.whisper).toBe(true);
    expect(body.ollama).toBe(true);
    expect(body.model).toBe("/models/ggml-tiny.en.bin");
  });

  it("returns whisper false when whisper-server is down", async () => {
    vi.mocked(isWhisperServerRunning).mockResolvedValue(false);
    vi.mocked(ensureOllamaRunning).mockResolvedValue(true);
    vi.mocked(getDefaultModelPath).mockResolvedValue(null);

    const res = await server.inject({
      method: "GET",
      url: "/api/dictation/status",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.whisper).toBe(false);
    expect(body.ollama).toBe(true);
    expect(body.model).toBeNull();
  });
});

describe("POST /api/dictation/transcribe", () => {
  it("starts whisper-server if needed and proxies audio", async () => {
    vi.mocked(getDefaultModelPath).mockResolvedValue(
      "/models/ggml-tiny.en.bin",
    );
    vi.mocked(isWhisperServerRunning).mockResolvedValue(false);
    vi.mocked(waitForWhisperReady).mockResolvedValue(true);

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
    expect(startWhisperServer).toHaveBeenCalledWith(
      "/usr/bin/whisper",
      "/models/ggml-tiny.en.bin",
    );
    expect(touchWhisperActivity).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("returns 400 when no model is downloaded", async () => {
    vi.mocked(getDefaultModelPath).mockResolvedValue(null);

    const res = await server.inject({
      method: "POST",
      url: "/api/dictation/transcribe",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("fake wav data"),
    });

    expect(res.statusCode).toBe(400);
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
    vi.mocked(ensureOllamaRunning).mockResolvedValue(true);
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
