import { readFile } from "node:fs/promises";
import { log } from "../../utils/logger";
import { NotFoundError } from "./errors";
import { requireOrphanFile, partitionByPid, writeRemaining } from "./helpers";

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
