import { appendFileSync } from "node:fs";
import { sessionLogPath, orphanPath } from "@weaver/shared/paths";
import { claudeCodeAdapter } from "./adapter";
import { log } from "./utils/logger";

const sessionIdIdx = process.argv.indexOf("--session-id");
const pidIdx = process.argv.indexOf("--pid");
const sessionId =
  sessionIdIdx !== -1 ? process.argv[sessionIdIdx + 1] : "orphan";
const pid = pidIdx !== -1 ? Number(process.argv[pidIdx + 1]) : undefined;

let raw: unknown;
try {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  raw = JSON.parse(Buffer.concat(chunks).toString());
} catch (e) {
  log({
    timestamp: new Date().toISOString(),
    event: "stdin_parse_error",
    error: String(e),
  });
  process.exit(1);
}

const event = claudeCodeAdapter.parseEvent(raw, {
  sessionId,
  timestamp: new Date().toISOString(),
  pid,
});

const logPath =
  sessionId === "orphan" ? orphanPath() : sessionLogPath(sessionId);
appendFileSync(logPath, JSON.stringify(event) + "\n");

fetch("http://localhost:8143/api/notify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sessionId, eventName: event.eventName }),
  signal: AbortSignal.timeout(1000),
}).catch(() => {});
