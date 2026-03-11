import { readFileSync, existsSync } from "node:fs";
import type { HookEvent } from "@weaver/shared/types";

export function getCurrentTurnEvents(sessionLogPath: string): HookEvent[] {
  if (!existsSync(sessionLogPath)) {
    return [];
  }

  let raw: string;
  try {
    raw = readFileSync(sessionLogPath, "utf-8");
  } catch {
    return [];
  }

  const events: HookEvent[] = raw
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as HookEvent];
      } catch {
        return [];
      }
    });

  if (events.length === 0) {
    return [];
  }

  const boundaryIndex = events.findLastIndex(
    (e) =>
      e.event.hook_event_name === "userPromptSubmit" ||
      e.event.hook_event_name === "agentSpawn",
  );

  return boundaryIndex === -1 ? events : events.slice(boundaryIndex);
}
