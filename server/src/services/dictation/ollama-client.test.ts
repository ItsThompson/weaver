const mockLog = vi.hoisted(() => vi.fn());
vi.mock("../../utils/logger", () => ({ log: mockLog }));

import { checkOllamaHealth, generateText } from "./ollama-client";

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

describe("generateText", () => {
  it("sends correct request body and returns response text", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: "Cleaned text." }),
    } as unknown as Response);

    const result = await generateText(
      "http://localhost:11434",
      "phi4-mini",
      "Fix this transcript",
    );

    expect(result).toBe("Cleaned text.");
    expect(fetch).toHaveBeenCalledWith("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi4-mini",
        prompt: "Fix this transcript",
        stream: false,
      }),
    });
  });

  it("returns an error string when Ollama responds with non-200", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    const result = await generateText(
      "http://localhost:11434",
      "phi4-mini",
      "Fix this",
    );

    expect(result).toMatch(/Ollama error: 500 Internal Server Error/);
  });

  it("returns an error string when fetch throws a network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await generateText(
      "http://localhost:11434",
      "phi4-mini",
      "Fix this",
    );

    expect(result).toMatch(/Ollama request failed: ECONNREFUSED/);
  });
});
