import { mkdir, writeFile, appendFile } from "node:fs/promises";
import type { Session } from "@weaver/shared/types";
import { weaverDir, logsDir, sessionsFile } from "@weaver/shared/paths";
import { log } from "../../utils/logger";
import { FileCache, parseJsonlFile } from "../file-cache/index";

const sessionCache = new FileCache<Session[]>();
export const _sessionCache = sessionCache;

export async function ensureDataDir(): Promise<void> {
  try {
    await mkdir(weaverDir(), { recursive: true });
    await mkdir(logsDir(), { recursive: true });
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
  const filePath = sessionsFile();
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
  await appendFile(sessionsFile(), JSON.stringify(session) + "\n", "utf-8");
  sessionCache.invalidate(sessionsFile());
}

export async function writeSessions(sessions: Session[]): Promise<void> {
  const content =
    sessions.map((session) => JSON.stringify(session)).join("\n") + "\n";
  await writeFile(sessionsFile(), content, "utf-8");
  sessionCache.invalidate(sessionsFile());
}
