import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Session } from "@weaver/shared/types";
import { log } from "../../utils/logger";
import { FileCache, parseJsonlFile } from "../file-cache/index";

const DATA_DIR = () => join(homedir(), ".weaver");
const LOGS_DIR = () => join(DATA_DIR(), "logs");
const SESSIONS_FILE = () => join(DATA_DIR(), "sessions.jsonl");

const sessionCache = new FileCache<Session[]>();
export const _sessionCache = sessionCache;

export async function ensureDataDir(): Promise<void> {
  try {
    await mkdir(DATA_DIR(), { recursive: true });
    await mkdir(LOGS_DIR(), { recursive: true });
  } catch (err) {
    log({
      timestamp: new Date().toISOString(),
      event: "ensure_data_dir_failed",
      error: String(err),
    });
    throw err;
  }
}

export async function readSessions(): Promise<Session[]> {
  const filePath = SESSIONS_FILE();
  return sessionCache.get(filePath, () =>
    parseJsonlFile<Session>(filePath, (line) =>
      log({
        timestamp: new Date().toISOString(),
        event: "malformed_session_line",
        line,
      }),
    ),
  );
}

export async function appendSession(session: Session): Promise<void> {
  await appendFile(SESSIONS_FILE(), JSON.stringify(session) + "\n", "utf-8");
  sessionCache.invalidate(SESSIONS_FILE());
}

export async function writeSessions(sessions: Session[]): Promise<void> {
  const content = sessions.map((s) => JSON.stringify(s)).join("\n") + "\n";
  await writeFile(SESSIONS_FILE(), content, "utf-8");
  sessionCache.invalidate(SESSIONS_FILE());
}
