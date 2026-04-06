import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { dictationsPath } from "@weaver/shared/paths";
import type { DictationLogEntry } from "@weaver/shared/types";
import { parseJsonlFile } from "../file-cache/index";
import { log } from "../../utils/logger";

export async function logDictation(entry: DictationLogEntry): Promise<void> {
  const filePath = dictationsPath();
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function readDictationHistory(): Promise<DictationLogEntry[]> {
  const entries = await parseJsonlFile<DictationLogEntry>(
    dictationsPath(),
    (line) =>
      log({
        timestamp: new Date().toISOString(),
        event: "malformed_dictation_line",
        line,
      }),
  );
  return entries.reverse();
}
