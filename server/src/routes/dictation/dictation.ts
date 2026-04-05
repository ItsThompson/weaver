import type { FastifyInstance } from "fastify";
import type { Snippet, WhisperModel, ApiError } from "@weaver/shared/types";
import {
  isWhisperServerRunning,
  startWhisperServer,
  waitForWhisperReady,
  touchWhisperActivity,
  WHISPER_PORT,
  checkOllamaHealth,
  listOllamaModels,
  ensureOllamaRunning,
  generateText,
  logDictation,
  AVAILABLE_MODELS,
  downloadModel,
  listLocalModels,
  getDefaultModelPath,
} from "../../services/dictation/index";
import {
  chunkTranscript,
  hasPunctuation,
} from "../../services/dictation/chunk-transcript";
import { readConfig } from "../../services/config/index";
import { log } from "../../utils/logger";

function matchSnippet(transcript: string, snippets: Snippet[]): Snippet | null {
  const normalize = (s: string) => s.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const norm = normalize(transcript);
  if (!norm) {
    return null;
  }
  const matches = snippets.filter((s) => normalize(s.trigger) === norm);
  return matches.length === 1 ? matches[0] : null;
}

type OllamaError = "not_installed" | "model_not_found" | null;

function modelMatchesAny(
  configuredModel: string,
  availableModels: string[],
): boolean {
  return availableModels.some(
    (name) =>
      name === configuredModel || name.startsWith(`${configuredModel}:`),
  );
}

async function checkOllama(
  url: string,
  model: string,
): Promise<{ ok: boolean; error: OllamaError }> {
  const running = await ensureOllamaRunning(url);
  if (!running) {
    return { ok: false, error: "not_installed" };
  }
  const models = await listOllamaModels(url);
  if (!modelMatchesAny(model, models)) {
    return { ok: false, error: "model_not_found" };
  }
  return { ok: true, error: null };
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
    Reply: {
      whisper: boolean;
      ollama: boolean;
      ollamaError: OllamaError;
      ollamaModel: string;
      model: string | null;
    };
  }>("/api/dictation/status", async () => {
    const start = Date.now();
    const { config } = await readConfig();
    const modelPath = await getDefaultModelPath();
    const needsOllama = config.dictation.llm_cleanup;

    if (!modelPath || !whisperBinPath) {
      const ollamaResult = needsOllama
        ? await checkOllama(
            config.dictation.ollama_url,
            config.dictation.ollama_model,
          )
        : { ok: true, error: null as OllamaError };
      log({
        timestamp: new Date().toISOString(),
        event: "dictation_status",
        durationMs: Date.now() - start,
        whisper: false,
        ollama: ollamaResult.ok,
        ollamaError: ollamaResult.error,
        hasModel: !!modelPath,
        hasBin: !!whisperBinPath,
      });
      return {
        whisper: false,
        ollama: ollamaResult.ok,
        ollamaError: ollamaResult.error,
        ollamaModel: config.dictation.ollama_model,
        model: modelPath,
      };
    }

    // Start whisper and ollama in parallel
    const running = await isWhisperServerRunning();
    if (!running) {
      startWhisperServer(whisperBinPath, modelPath);
    }
    const [whisper, ollamaResult] = await Promise.all([
      running ? Promise.resolve(true) : waitForWhisperReady(),
      needsOllama
        ? checkOllama(
            config.dictation.ollama_url,
            config.dictation.ollama_model,
          )
        : Promise.resolve({ ok: true, error: null as OllamaError }),
    ]);
    log({
      timestamp: new Date().toISOString(),
      event: "dictation_status",
      durationMs: Date.now() - start,
      whisper,
      ollama: ollamaResult.ok,
      ollamaError: ollamaResult.error,
      coldStart: !running,
    });
    return {
      whisper,
      ollama: ollamaResult.ok,
      ollamaError: ollamaResult.error,
      ollamaModel: config.dictation.ollama_model,
      model: modelPath,
    };
  });

  server.post<{ Reply: { text: string } | ApiError }>(
    "/api/dictation/transcribe",
    async (request, reply) => {
      const start = Date.now();
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
      const coldStart = !running;
      if (!running) {
        startWhisperServer(whisperBinPath, modelPath);
        const ready = await waitForWhisperReady();
        if (!ready) {
          return reply
            .status(503)
            .send({ error: "Whisper server failed to start" });
        }
      }
      touchWhisperActivity();
      const readyMs = Date.now() - start;

      const audioBuffer = request.body as Buffer;
      const boundary = "----WeaverBoundary" + Date.now();
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const body = Buffer.concat([
        Buffer.from(header),
        audioBuffer,
        Buffer.from(footer),
      ]);

      const inferenceStart = Date.now();
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
          coldStart,
          readyMs,
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
        coldStart,
        readyMs,
        inferenceMs: Date.now() - inferenceStart,
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

    await ensureOllamaRunning(ollama_url);

    try {
      // If whisper didn't add punctuation, do a cheap first pass to add it
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
