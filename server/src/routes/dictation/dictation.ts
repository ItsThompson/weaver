import type { FastifyInstance } from "fastify";
import type { Snippet, WhisperModel, ApiError } from "@weaver/shared/types";
import {
  isWhisperServerRunning,
  startWhisperServer,
  touchWhisperActivity,
  WHISPER_PORT,
  checkOllamaHealth,
  generateText,
  logDictation,
  AVAILABLE_MODELS,
  downloadModel,
  listLocalModels,
  getDefaultModelPath,
} from "../../services/dictation/index";
import { readConfig } from "../../services/config/index";

function matchSnippet(transcript: string, snippets: Snippet[]): Snippet | null {
  const normalize = (s: string) => s.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const norm = normalize(transcript);
  if (!norm) {
    return null;
  }
  const matches = snippets.filter((s) => normalize(s.trigger) === norm);
  return matches.length === 1 ? matches[0] : null;
}

export function registerDictationRoutes(
  server: FastifyInstance,
  whisperBinPath: string | undefined,
): void {
  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  server.get<{
    Reply: { whisper: boolean; ollama: boolean; model: string | null };
  }>("/api/dictation/status", async () => {
    const { config } = await readConfig();
    const [whisper, ollama, model] = await Promise.all([
      isWhisperServerRunning(),
      checkOllamaHealth(config.dictation.ollama_url),
      getDefaultModelPath(),
    ]);
    return { whisper, ollama, model };
  });

  server.post<{ Reply: { text: string } | ApiError }>(
    "/api/dictation/transcribe",
    async (request, reply) => {
      const modelPath = await getDefaultModelPath();
      if (!modelPath) {
        return reply.status(400).send({ error: "No whisper model downloaded" });
      }
      if (!whisperBinPath) {
        return reply
          .status(400)
          .send({ error: "Whisper binary path not configured" });
      }

      const running = await isWhisperServerRunning();
      if (!running) {
        startWhisperServer(whisperBinPath, modelPath);
        await new Promise((r) => setTimeout(r, 1000));
      }
      touchWhisperActivity();

      const audioBuffer = request.body as Buffer;
      const boundary = "----WeaverBoundary" + Date.now();
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const body = Buffer.concat([
        Buffer.from(header),
        audioBuffer,
        Buffer.from(footer),
      ]);

      const res = await fetch(`http://127.0.0.1:${WHISPER_PORT}/inference`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      if (!res.ok) {
        return reply
          .status(502)
          .send({ error: `Whisper server error: ${res.status}` });
      }

      const result = (await res.json()) as { text: string };
      return { text: result.text };
    },
  );

  server.post<{
    Body: { transcript: string; snippets: Snippet[] };
    Reply: { processedText: string; snippetUsed: string | null } | ApiError;
  }>("/api/dictation/process", async (request, reply) => {
    const { transcript, snippets } = request.body;
    if (!transcript || typeof transcript !== "string") {
      return reply.status(400).send({ error: "transcript is required" });
    }

    const matched = matchSnippet(transcript, snippets || []);
    if (matched) {
      await logDictation({
        timestamp: new Date().toISOString(),
        rawTranscript: transcript,
        processedText: matched.expansion,
      });
      return { processedText: matched.expansion, snippetUsed: matched.trigger };
    }

    const { config } = await readConfig();
    const prompt = `Clean up this dictated text. Fix grammar, punctuation, and remove filler words. Return only the cleaned text, nothing else:\n\n${transcript}`;
    const processedText = await generateText(
      config.dictation.ollama_url,
      config.dictation.ollama_model,
      prompt,
    );

    await logDictation({
      timestamp: new Date().toISOString(),
      rawTranscript: transcript,
      processedText,
    });

    return { processedText, snippetUsed: null };
  });

  server.get<{
    Reply: { available: WhisperModel[]; local: string[] };
  }>("/api/dictation/models", async () => {
    const local = await listLocalModels();
    return { available: AVAILABLE_MODELS, local };
  });

  server.post<{
    Body: { filename: string };
  }>("/api/dictation/models/download", async (request, reply) => {
    const { filename } = request.body;
    const model = AVAILABLE_MODELS.find((m) => m.filename === filename);
    if (!model) {
      return reply.status(400).send({ error: "Unknown model" });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      await downloadModel(model, (progress) => {
        reply.raw.write(`data: ${JSON.stringify({ progress })}\n\n`);
      });
      reply.raw.write(`data: ${JSON.stringify({ complete: true })}\n\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    }
    reply.raw.end();
  });
}
