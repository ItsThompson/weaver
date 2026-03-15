import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { HookEvent, OrphanGroup } from "@weaver/shared/types";
import { groupEventsByTurn } from "../log-parser/index";
import { parseJsonlFile } from "../file-cache/index";
import { log } from "../../utils/logger";

const ORPHAN_PATH = () => join(homedir(), ".weaver", "logs", "orphan.jsonl");
const LOGS_DIR = () => join(homedir(), ".weaver", "logs");

export async function readOrphanEvents(): Promise<HookEvent[]> {
  return parseJsonlFile<HookEvent>(ORPHAN_PATH(), (line) =>
    log({
      timestamp: new Date().toISOString(),
      event: "orphan_parse_error",
      line,
    }),
  );
}

export function groupByPid(events: HookEvent[]): OrphanGroup[] {
  const byPid = events.reduce((map, event) => {
    const pid = event.pid ?? 0;
    const group = map.get(pid) ?? [];
    group.push(event);
    map.set(pid, group);
    return map;
  }, new Map<number, HookEvent[]>());

  return Array.from(byPid.entries()).map(([pid, pidEvents]) => ({
    pid,
    turns: groupEventsByTurn(pidEvents),
    eventCount: pidEvents.length,
    timeRange: {
      start: pidEvents[0].timestamp,
      end: pidEvents[pidEvents.length - 1].timestamp,
    },
  }));
}

interface PartitionResult {
  matched: HookEvent[];
  remainingLines: string[];
}

/** Read orphan file and partition lines by PID. Throws NotFoundError if file missing or no matches. */
function partitionByPid(
  content: string,
  pid: number,
  errorEvent: string,
): PartitionResult {
  const lines = content.split("\n");
  return lines.reduce<PartitionResult>(
    (acc, line) => {
      if (!line.trim()) {
        return acc;
      }
      try {
        const event = JSON.parse(line) as HookEvent;
        if ((event.pid ?? 0) === pid) {
          acc.matched.push(event);
        } else {
          acc.remainingLines.push(line);
        }
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: errorEvent,
          error: String(e),
        });
        acc.remainingLines.push(line);
      }
      return acc;
    },
    { matched: [], remainingLines: [] },
  );
}

function requireOrphanFile(): string {
  const filePath = ORPHAN_PATH();
  if (!existsSync(filePath)) {
    throw new NotFoundError("No orphan log found");
  }
  return filePath;
}

function writeRemaining(filePath: string, lines: string[]): Promise<void> {
  return writeFile(filePath, lines.length > 0 ? lines.join("\n") + "\n" : "");
}

export async function assignOrphanEvents(
  targetSessionId: string,
  pid: number,
): Promise<{ movedCount: number }> {
  const filePath = requireOrphanFile();
  const targetLog = join(LOGS_DIR(), `${targetSessionId}.jsonl`);

  if (!existsSync(targetLog)) {
    throw new NotFoundError("Target session log not found");
  }

  const content = await readFile(filePath, "utf-8");
  const { matched, remainingLines } = partitionByPid(
    content,
    pid,
    "orphan_assign_parse_error",
  );

  if (matched.length === 0) {
    throw new NotFoundError(`No orphan events found for PID ${pid}`);
  }

  const cleanedLines = matched.map((event) => {
    const { pid: _, ...clean } = event;
    return JSON.stringify(clean);
  });

  await appendFile(targetLog, cleanedLines.join("\n") + "\n");
  await writeRemaining(filePath, remainingLines);

  log({
    timestamp: new Date().toISOString(),
    event: "orphans_assigned",
    pid,
    targetSessionId,
    count: matched.length,
  });

  return { movedCount: matched.length };
}

export async function deleteOrphanEvents(
  pid: number,
): Promise<{ deletedCount: number }> {
  const filePath = requireOrphanFile();
  const content = await readFile(filePath, "utf-8");
  const { matched, remainingLines } = partitionByPid(
    content,
    pid,
    "orphan_delete_parse_error",
  );

  if (matched.length === 0) {
    throw new NotFoundError(`No orphan events found for PID ${pid}`);
  }

  await writeRemaining(filePath, remainingLines);

  log({
    timestamp: new Date().toISOString(),
    event: "orphans_deleted",
    pid,
    count: matched.length,
  });

  return { deletedCount: matched.length };
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
