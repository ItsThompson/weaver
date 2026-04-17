import { mkdir, appendFile } from "node:fs/promises";
import { atomicWriteFile } from "../../utils/atomic-write";
import type { Session } from "@weaver/shared/types";
import { Harness } from "@weaver/shared/types";
import { weaverDir, logsDir, sessionsPath } from "@weaver/shared/paths";
import { log } from "../../utils/logger";
import { FileCache, parseJsonlFile } from "../file-cache/index";

export interface SessionStore {
  ensureDataDir(): Promise<void>;
  readSessions(): Promise<Session[]>;
  appendSession(session: Session): Promise<void>;
  writeSessions(sessions: Session[]): Promise<void>;
  _sessionCache: FileCache<Session[]>;
}

export function createSessionStore(): SessionStore {
  const sessionCache = new FileCache<Session[]>();

  const store: SessionStore = {
    _sessionCache: sessionCache,

    async ensureDataDir(): Promise<void> {
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
    },

    async readSessions(): Promise<Session[]> {
      const filePath = sessionsPath();
      return sessionCache.get(filePath, async () => {
        const sessions = await parseJsonlFile<Session>(filePath, (line) =>
          log({
            timestamp: new Date().toISOString(),
            event: "malformed_session_line",
            line,
          }),
        );
        // Backfill harness for pre-migration sessions that may lack the field
        sessions.forEach((s) => {
          s.harness ??= Harness.KIRO_CLI;
        });
        // Deduplicate by session ID (last entry wins). Claude Code's session
        // resume flow appends a new entry for an existing session_id; this
        // collapses duplicates so callers see at most one entry per session.
        const byId = new Map<string, Session>();
        sessions.forEach((s) => byId.set(s.id, s));
        return [...byId.values()];
      });
    },

    async appendSession(session: Session): Promise<void> {
      await appendFile(sessionsPath(), JSON.stringify(session) + "\n", "utf-8");
      sessionCache.invalidate(sessionsPath());
    },

    async writeSessions(sessions: Session[]): Promise<void> {
      const content =
        sessions.map((session) => JSON.stringify(session)).join("\n") + "\n";
      await atomicWriteFile(sessionsPath(), content);
      sessionCache.invalidate(sessionsPath());
    },
  };

  return store;
}

const defaultStore = createSessionStore();
export const {
  ensureDataDir,
  readSessions,
  appendSession,
  writeSessions,
  _sessionCache,
} = defaultStore;
