import type { FastifyInstance } from "fastify";
import type { Snippet, WhisperModel, ApiError } from "@weaver/shared/types";
import {
  WHISPER_PORT,
  generateText,
  logDictation,
  readDictationHistory,
  AVAILABLE_MODELS,
  downloadModel,
  listLocalModels,
} from "../../services/dictation/index";
import {
  chunkTranscript,
  hasPunctuation,
} from "../../services/dictation/chunk-transcript";
import { readConfig } from "../../services/config/index";
import { log } from "../../utils/logger";
import { serviceManager } from "../../services/service-manager-instance";

function matchSnippet(transcript: string, snippets: Snippet[]): Snippet | null {
  const normalize = (s: string) => s.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const norm = normalize(transcript);
  if (!norm) {
    return null;
  }
  const matches = snippets.filter((s) => normalize(s.trigger) === norm);
  return matches.length === 1 ? matches[0] : null;
}

export function registerDictationRoutes(server: FastifyInstance): void {
  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  server.get("/api/dictation/history", async () => {
    const entries = await readDictationHistory();
    return { entries };
  });

  server.post<{ Reply: { text: string } | ApiError }>(
    "/api/dictation/transcribe",
    async (request, reply) => {
      const status = await serviceManager.getStatus();
      if (status.services.whisper.state !== "running") {
        return reply
          .status(503)
          .send({ error: "Whisper is not available. Check service status." });
      }

      const start = Date.now();
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
        log({
          timestamp: new Date().toISOString(),
          event: "dictation_transcribe",
          durationMs: Date.now() - start,
          success: false,
          whisperStatus: res.status,
          audioBytes: audioBuffer.length,
        });
        return reply
          .status(502)
          .send({ error: `Whisper server error: ${res.status}` });
      }

      const result = (await res.json()) as { text: string };
      log({
        timestamp: new Date().toISOString(),
        event: "dictation_transcribe",
        durationMs: Date.now() - start,
        audioBytes: audioBuffer.length,
        textLength: result.text.length,
        success: true,
      });
      return { text: result.text };
    },
  );

  server.post<{
    Body: { transcript: string; snippets: Snippet[] };
    Reply: { processedText: string; snippetUsed: string | null } | ApiError;
  }>("/api/dictation/process", async (request, reply) => {
    const start = Date.now();
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
      log({
        timestamp: new Date().toISOString(),
        event: "dictation_process",
        durationMs: Date.now() - start,
        snippetUsed: matched.trigger,
        transcriptLength: transcript.length,
      });
      return { processedText: matched.expansion, snippetUsed: matched.trigger };
    }

    const { config } = await readConfig();
    const { ollama_url, ollama_model, llm_cleanup } = config.dictation;

    if (!llm_cleanup) {
      await logDictation({
        timestamp: new Date().toISOString(),
        rawTranscript: transcript,
        processedText: transcript,
      });
      log({
        timestamp: new Date().toISOString(),
        event: "dictation_process",
        durationMs: Date.now() - start,
        transcriptLength: transcript.length,
        llmSkipped: true,
      });
      return { processedText: transcript, snippetUsed: null };
    }

    const status = await serviceManager.getStatus();
    if (status.services.ollama.state !== "running") {
      return reply
        .status(503)
        .send({ error: "Ollama is not available. Check service status." });
    }

    try {
      let punctuated = transcript;
      const needsPunctuation = !hasPunctuation(transcript);
      if (needsPunctuation) {
        punctuated = await generateText(
          ollama_url,
          ollama_model,
          `Add punctuation and capitalization to this raw speech transcript. Do NOT change any words, do NOT remove anything, do NOT add commentary. Return ONLY the punctuated text.\n\n${transcript}`,
        );
      }

      const chunks = chunkTranscript(punctuated);
      const cleanedChunks = await Promise.all(
        chunks.map((chunk) => {
          const prompt = `You are a dictation cleanup tool. Your ONLY job is to take raw speech-to-text output and make minimal fixes. Rules:
- Add correct punctuation and capitalization
- Fix obvious grammar errors
- Remove filler words (um, uh, like, you know, basically, so, right)
- Do NOT rephrase, summarize, or reword anything
- Do NOT remove or combine sentences
- Do NOT change the meaning or remove details
- Keep the speaker's original words and sentence structure
- Return ONLY the cleaned text with no commentary

Raw transcript:
${chunk}`;
          return generateText(ollama_url, ollama_model, prompt);
        }),
      );
      const processedText = cleanedChunks.join(" ");

      await logDictation({
        timestamp: new Date().toISOString(),
        rawTranscript: transcript,
        processedText,
      });

      log({
        timestamp: new Date().toISOString(),
        event: "dictation_process",
        durationMs: Date.now() - start,
        transcriptLength: transcript.length,
        needsPunctuation,
        chunkCount: chunks.length,
        model: ollama_model,
      });

      return { processedText, snippetUsed: null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "LLM processing failed";
      log({
        timestamp: new Date().toISOString(),
        event: "dictation_process_error",
        durationMs: Date.now() - start,
        error: message,
      });
      return reply.status(500).send({ error: message });
    }
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
