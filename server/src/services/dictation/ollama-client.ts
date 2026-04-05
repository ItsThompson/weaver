import { log } from "../../utils/logger";

export async function checkOllamaHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(url: string): Promise<string[]> {
  try {
    const res = await fetch(`${url}/api/tags`);
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as {
      models?: { name: string }[];
    };
    return (body.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

export async function generateText(
  url: string,
  model: string,
  prompt: string,
): Promise<string> {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are a text transformation tool. You receive raw text and return transformed text. You NEVER respond conversationally. You NEVER add commentary, greetings, or explanations. You return ONLY the transformed text.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      log({
        timestamp: new Date().toISOString(),
        event: "ollama_generate_done",
        model,
        durationMs: Date.now() - start,
        success: false,
        status: res.status,
      });
      throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { message?: { content: string } };
    const text = body.message?.content ?? "";
    log({
      timestamp: new Date().toISOString(),
      event: "ollama_generate_done",
      model,
      durationMs: Date.now() - start,
      success: true,
      promptLength: prompt.length,
      responseLength: text.length,
    });
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({
      timestamp: new Date().toISOString(),
      event: "ollama_generate_done",
      model,
      durationMs: Date.now() - start,
      success: false,
      error: msg,
    });
    throw new Error(`Ollama request failed: ${msg}`);
  }
}
