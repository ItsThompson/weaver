import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PendingFile } from "../formatting";
import { formatPendingOutput } from "../formatting";

export function runInject(sessionId: string): {
  stdout: string;
  exitCode: number;
} {
  if (!sessionId) {
    return { stdout: "", exitCode: 0 };
  }

  const pendingPath = join(
    homedir(),
    ".weaver",
    "logs",
    `${sessionId}.pending`,
  );
  if (!existsSync(pendingPath)) {
    return { stdout: "", exitCode: 0 };
  }

  let data: PendingFile;
  try {
    data = JSON.parse(readFileSync(pendingPath, "utf-8"));
    if (!Array.isArray(data?.results)) {
      throw new Error("invalid");
    }
  } catch (e) {
    console.error("Failed to parse pending file:", pendingPath, e);
    try {
      unlinkSync(pendingPath);
    } catch (e) {
      console.warn("Failed to clean up pending file:", pendingPath, e);
    }
    return { stdout: "", exitCode: 0 };
  }

  try {
    unlinkSync(pendingPath);
  } catch (e) {
    console.warn("Failed to clean up pending file:", pendingPath, e);
  }

  const stdout = formatPendingOutput(data.results);
  return { stdout, exitCode: 0 };
}
