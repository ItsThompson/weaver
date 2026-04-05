import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { dictationsPath } from "@weaver/shared/paths";
import type { DictationLogEntry } from "@weaver/shared/types";

export async function logDictation(entry: DictationLogEntry): Promise<void> {
  const filePath = dictationsPath();
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}
