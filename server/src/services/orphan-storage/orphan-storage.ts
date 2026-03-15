import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { HookEvent, OrphanGroup } from "@weaver/shared/types";
import { groupEventsByTurn } from "../log-parser/index";
import { log } from "../../utils/logger";

const ORPHAN_PATH = () => join(homedir(), ".weaver", "logs", "orphan.jsonl");
const LOGS_DIR = () => join(homedir(), ".weaver", "logs");

export async function readOrphanEvents(): Promise<HookEvent[]> {
  const filePath = ORPHAN_PATH();
  if (!existsSync(filePath)) {
    return [];
  }
  const content = await readFile(filePath, "utf-8");
  return content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .reduce<HookEvent[]>((events, line) => {
      try {
        events.push(JSON.parse(line));
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "orphan_parse_error",
          error: String(e),
        });
      }
      return events;
    }, []);
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

export async function assignOrphanEvents(
  targetSessionId: string,
  pid: number,
): Promise<{ movedCount: number }> {
  const filePath = ORPHAN_PATH();
  const targetLog = join(LOGS_DIR(), `${targetSessionId}.jsonl`);

  if (!existsSync(filePath)) {
    throw new NotFoundError("No orphan log found");
  }
  if (!existsSync(targetLog)) {
    throw new NotFoundError("Target session log not found");
  }

  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  const { toMove, toKeep } = lines.reduce<{
    toMove: string[];
    toKeep: string[];
  }>(
    (acc, line) => {
      try {
        const event = JSON.parse(line) as HookEvent;
        if ((event.pid ?? 0) === pid) {
          const { pid: _, ...clean } = event;
          acc.toMove.push(JSON.stringify(clean));
        } else {
          acc.toKeep.push(line);
        }
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "orphan_assign_parse_error",
          error: String(e),
        });
        acc.toKeep.push(line);
      }
      return acc;
    },
    { toMove: [], toKeep: [] },
  );

  if (toMove.length === 0) {
    throw new NotFoundError(`No orphan events found for PID ${pid}`);
  }

  await appendFile(targetLog, toMove.join("\n") + "\n");
  await writeFile(filePath, toKeep.length > 0 ? toKeep.join("\n") + "\n" : "");

  log({
    timestamp: new Date().toISOString(),
    event: "orphans_assigned",
    pid,
    targetSessionId,
    count: toMove.length,
  });

  return { movedCount: toMove.length };
}

export async function deleteOrphanEvents(
  pid: number,
): Promise<{ deletedCount: number }> {
  const filePath = ORPHAN_PATH();
  if (!existsSync(filePath)) {
    throw new NotFoundError("No orphan log found");
  }

  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  const { deleted, toKeep } = lines.reduce<{
    deleted: number;
    toKeep: string[];
  }>(
    (acc, line) => {
      try {
        const event = JSON.parse(line) as HookEvent;
        if ((event.pid ?? 0) === pid) {
          acc.deleted++;
        } else {
          acc.toKeep.push(line);
        }
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "orphan_delete_parse_error",
          error: String(e),
        });
        acc.toKeep.push(line);
      }
      return acc;
    },
    { deleted: 0, toKeep: [] },
  );

  if (deleted === 0) {
    throw new NotFoundError(`No orphan events found for PID ${pid}`);
  }

  await writeFile(filePath, toKeep.length > 0 ? toKeep.join("\n") + "\n" : "");

  log({
    timestamp: new Date().toISOString(),
    event: "orphans_deleted",
    pid,
    count: deleted,
  });

  return { deletedCount: deleted };
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
