import type { HookEvent, OrphanGroup } from "@weaver/shared/types";
import { groupEventsByTurn } from "../log-parser/index";
import { parseJsonlFile } from "../file-cache/index";
import { log } from "../../utils/logger";
import { orphanPath } from "@weaver/shared/paths";

export async function readOrphanEvents(): Promise<HookEvent[]> {
  return parseJsonlFile<HookEvent>(orphanPath(), (line) =>
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
