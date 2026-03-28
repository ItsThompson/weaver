import type { HookEvent } from "@weaver/shared/types";
import { sessionLogPath } from "@weaver/shared/paths";
import { log } from "../../utils/logger";
import { FileCache, parseJsonlFile } from "../file-cache/index";
import type { LastEvent } from "./types";

export interface LogParser {
  parseLogFile: (sessionId: string) => Promise<HookEvent[]>;
  getLastEvent: (sessionId: string) => Promise<LastEvent | null>;
  _logCache: FileCache<HookEvent[]>;
}

export function createLogParser(): LogParser {
  const logCache = new FileCache<HookEvent[]>();

  const parser: LogParser = {
    _logCache: logCache,

    async parseLogFile(sessionId: string): Promise<HookEvent[]> {
      const filePath = sessionLogPath(sessionId);
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
    },

    async getLastEvent(sessionId: string): Promise<LastEvent | null> {
      const events = await parser.parseLogFile(sessionId);
      const last = events.findLast((event) => event.event.hook_event_name);
      return last
        ? { name: last.event.hook_event_name, timestamp: last.timestamp }
        : null;
    },
  };

  return parser;
}

const defaultParser = createLogParser();
export const { parseLogFile, getLastEvent } = defaultParser;
export const _logCache = defaultParser._logCache;
