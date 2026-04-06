import { createManagedProcess } from "../managed-process";
import { log } from "../../utils/logger";

export const WHISPER_PORT = 8178;
const WHISPER_HOST = "127.0.0.1";

const managed = createManagedProcess({
  name: "whisper_server",
  cleanup: { type: "port", port: WHISPER_PORT },
});

export function startWhisperServer(binPath: string, modelPath: string): void {
  const child = managed.start(binPath, [
    "--model",
    modelPath,
    "--port",
    String(WHISPER_PORT),
    "--host",
    WHISPER_HOST,
  ]);

  child.stderr?.on("data", (data: Buffer) => {
    log({
      timestamp: new Date().toISOString(),
      event: "whisper_server_stderr",
      message: data.toString().trim(),
    });
  });
}

export function stopWhisperServer(): void {
  managed.stop();
}

export async function isWhisperServerRunning(): Promise<boolean> {
  if (!managed.isAlive()) {
    return false;
  }
  try {
    const res = await fetch(`http://${WHISPER_HOST}:${WHISPER_PORT}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function buildSilentWav(): Buffer {
  const sampleRate = 16000;
  const numSamples = 1600;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

async function warmupWhisper(): Promise<boolean> {
  const wav = buildSilentWav();
  const boundary = "----WeaverWarmup";
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="warmup.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(header), wav, Buffer.from(footer)]);

  try {
    const res = await fetch(
      `http://${WHISPER_HOST}:${WHISPER_PORT}/inference`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForWhisperReady(
  retries = 30,
  intervalMs = 500,
): Promise<boolean> {
  const start = Date.now();
  log({
    timestamp: new Date().toISOString(),
    event: "whisper_ready_poll_start",
    maxRetries: retries,
    intervalMs,
  });

  let httpReady = false;
  for (let i = 0; i < retries; i++) {
    if (await isWhisperServerRunning()) {
      httpReady = true;
      log({
        timestamp: new Date().toISOString(),
        event: "whisper_http_ready",
        attempts: i + 1,
        durationMs: Date.now() - start,
      });
      break;
    }
    if (!managed.isAlive()) {
      log({
        timestamp: new Date().toISOString(),
        event: "whisper_ready_poll_done",
        ready: false,
        reason: "process_exited",
        attempts: i + 1,
        durationMs: Date.now() - start,
      });
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (!httpReady) {
    log({
      timestamp: new Date().toISOString(),
      event: "whisper_ready_poll_done",
      ready: false,
      reason: "max_retries",
      attempts: retries,
      durationMs: Date.now() - start,
    });
    return false;
  }

  const warmupStart = Date.now();
  const warmed = await warmupWhisper();
  log({
    timestamp: new Date().toISOString(),
    event: "whisper_ready_poll_done",
    ready: warmed,
    reason: warmed ? undefined : "warmup_failed",
    durationMs: Date.now() - start,
    httpReadyMs: warmupStart - start,
    warmupMs: Date.now() - warmupStart,
  });
  return warmed;
}
