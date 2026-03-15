import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { HookEvent } from "@weaver/shared/types";
import { log } from "../../utils/logger";
import { NotFoundError } from "./errors";
import { ORPHAN_PATH } from "./paths";

export interface PartitionResult {
  matched: HookEvent[];
  remainingLines: string[];
}

export function partitionByPid(
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

export function requireOrphanFile(): string {
  const filePath = ORPHAN_PATH();
  if (!existsSync(filePath)) {
    throw new NotFoundError("No orphan log found");
  }
  return filePath;
}

export function writeRemaining(
  filePath: string,
  lines: string[],
): Promise<void> {
  return writeFile(filePath, lines.length > 0 ? lines.join("\n") + "\n" : "");
}
