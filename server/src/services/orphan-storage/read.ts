import type { WeaverEvent, OrphanGroup } from "@weaver/shared/types";
import { groupEventsByTurn } from "../log-parser/index";
import { parseJsonlFile } from "../file-cache/index";
import { log } from "../../utils/logger";
import { orphanPath } from "@weaver/shared/paths";

export async function readOrphanEvents(): Promise<WeaverEvent[]> {
  const raw = await parseJsonlFile<unknown>(orphanPath(), (line) =>
    log({
      timestamp: new Date().toISOString(),
      event: "orphan_parse_error",
      line,
    }),
  );
  return raw.filter(
    (entry): entry is WeaverEvent =>
      typeof entry === "object" && entry !== null && "eventName" in entry,
  );
}

export function groupByPid(events: WeaverEvent[]): OrphanGroup[] {
  const byPid = events.reduce((map, event) => {
    const pid = event.pid ?? 0;
    const group = map.get(pid) ?? [];
    group.push(event);
    map.set(pid, group);
    return map;
  }, new Map<number, WeaverEvent[]>());

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
