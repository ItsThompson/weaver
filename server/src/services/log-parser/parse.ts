import { join } from "node:path";
import { homedir } from "node:os";
import type { HookEvent } from "@weaver/shared/types";
import { log } from "../../utils/logger";
import { FileCache, parseJsonlFile } from "../file-cache/index";
import type { LastEvent } from "./types";

const LOGS_DIR = () => join(homedir(), ".weaver", "logs");

const logCache = new FileCache<HookEvent[]>();
export const _logCache = logCache;

export async function parseLogFile(sessionId: string): Promise<HookEvent[]> {
  const filePath = join(LOGS_DIR(), `${sessionId}.jsonl`);
  return logCache.get(filePath, () =>
    parseJsonlFile<HookEvent>(filePath, (line) =>
      log({
        timestamp: new Date().toISOString(),
        event: "malformed_log_line",
        sessionId,
        line,
      }),
    ),
  );
}

export async function getLastEvent(
  sessionId: string,
): Promise<LastEvent | null> {
  const events = await parseLogFile(sessionId);
  const last = events.findLast((event) => event.event.hook_event_name);
  return last
    ? { name: last.event.hook_event_name, timestamp: last.timestamp }
    : null;
}
