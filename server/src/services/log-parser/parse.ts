import type { WeaverEvent } from "@weaver/shared/types";
import { sessionLogPath } from "@weaver/shared/paths";
import { log } from "../../utils/logger";
import { FileCache, parseJsonlFile } from "../file-cache/index";
import type { LastEvent } from "./types";

export interface LogParser {
  parseLogFile: (sessionId: string) => Promise<WeaverEvent[]>;
  getLastEvent: (sessionId: string) => Promise<LastEvent | null>;
  _logCache: FileCache<WeaverEvent[]>;
}

export function createLogParser(): LogParser {
  const logCache = new FileCache<WeaverEvent[]>();

  const parser: LogParser = {
    _logCache: logCache,

    async parseLogFile(sessionId: string): Promise<WeaverEvent[]> {
      const filePath = sessionLogPath(sessionId);
      return logCache.get(filePath, async () => {
        const raw = await parseJsonlFile<unknown>(filePath, (line) =>
          log({
            timestamp: new Date().toISOString(),
            event: "malformed_log_line",
            sessionId,
            line,
          }),
        );
        return raw.filter(
          (entry): entry is WeaverEvent =>
            typeof entry === "object" && entry !== null && "eventName" in entry,
        );
      });
    },

    async getLastEvent(sessionId: string): Promise<LastEvent | null> {
      const events = await parser.parseLogFile(sessionId);
      const last = events.findLast((event) => event.eventName);
      return last ? { name: last.eventName, timestamp: last.timestamp } : null;
    },
  };

  return parser;
}

const defaultParser = createLogParser();
export const { parseLogFile, getLastEvent } = defaultParser;
export const _logCache = defaultParser._logCache;
