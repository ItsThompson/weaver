import { readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sessionLogPath } from "@weaver/shared/paths";
import { log } from "../../utils/logger";
import { NotFoundError } from "./errors";
import { requireOrphanFile, partitionByPid, writeRemaining } from "./helpers";

export async function assignOrphanEvents(
  targetSessionId: string,
  pid: number,
): Promise<{ movedCount: number }> {
  const filePath = requireOrphanFile();
  const targetLog = sessionLogPath(targetSessionId);

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
