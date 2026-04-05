const mockLog = vi.hoisted(() => vi.fn());
vi.mock("../../utils/logger", () => ({ log: mockLog }));

import {
  checkOllamaHealth,
  listOllamaModels,
  generateText,
} from "./ollama-client";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkOllamaHealth", () => {
  it("returns true when Ollama responds with 200", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    expect(await checkOllamaHealth("http://localhost:11434")).toBe(true);
    expect(fetch).toHaveBeenCalledWith("http://localhost:11434/api/tags");
  });

  it("returns false when Ollama responds with non-200", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    expect(await checkOllamaHealth("http://localhost:11434")).toBe(false);
  });

  it("returns false when fetch throws a network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await checkOllamaHealth("http://localhost:11434")).toBe(false);
  });
});

describe("listOllamaModels", () => {
  it("returns model names when Ollama responds with models", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          models: [{ name: "phi4-mini:latest" }, { name: "gemma3:1b" }],
        }),
    } as unknown as Response);

    const models = await listOllamaModels("http://localhost:11434");
    expect(models).toEqual(["phi4-mini:latest", "gemma3:1b"]);
  });

  it("returns empty array when Ollama is not reachable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await listOllamaModels("http://localhost:11434")).toEqual([]);
  });

  it("returns empty array when response has no models", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    expect(await listOllamaModels("http://localhost:11434")).toEqual([]);
  });
});

describe("generateText", () => {
  it("sends correct request body and returns response text", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: "Cleaned text." } }),
    } as unknown as Response);

    const result = await generateText(
      "http://localhost:11434",
      "phi4-mini",
      "Fix this transcript",
    );

    expect(result).toBe("Cleaned text.");
    expect(fetch).toHaveBeenCalledWith("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi4-mini",
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are a text transformation tool. You receive raw text and return transformed text. You NEVER respond conversationally. You NEVER add commentary, greetings, or explanations. You return ONLY the transformed text.",
          },
          { role: "user", content: "Fix this transcript" },
        ],
      }),
    });
  });

  it("throws when Ollama responds with non-200", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(
      generateText("http://localhost:11434", "phi4-mini", "Fix this"),
    ).rejects.toThrow("Ollama error: 500 Internal Server Error");
  });

  it("throws when fetch throws a network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      generateText("http://localhost:11434", "phi4-mini", "Fix this"),
    ).rejects.toThrow("Ollama request failed: ECONNREFUSED");
  });
});
