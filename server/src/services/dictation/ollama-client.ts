import { log } from "../../utils/logger";

export async function checkOllamaHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function generateText(
  url: string,
  model: string,
  prompt: string,
): Promise<string> {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
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
      return `Ollama error: ${res.status} ${res.statusText}`;
    }

    const body = (await res.json()) as { response: string };
    log({
      timestamp: new Date().toISOString(),
      event: "ollama_generate_done",
      model,
      durationMs: Date.now() - start,
      success: true,
      promptLength: prompt.length,
      responseLength: body.response.length,
    });
    return body.response;
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
    return `Ollama request failed: ${msg}`;
  }
}
