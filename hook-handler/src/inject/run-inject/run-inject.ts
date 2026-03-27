import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { pendingPath } from "@weaver/shared/paths";
import type { PendingFile } from "../formatting";
import { formatPendingOutput } from "../formatting";

export function runInject(sessionId: string): {
  stdout: string;
  exitCode: number;
} {
  if (!sessionId) {
    return { stdout: "", exitCode: 0 };
  }

  const path = pendingPath(sessionId);
  if (!existsSync(path)) {
    return { stdout: "", exitCode: 0 };
  }

  let data: PendingFile;
  try {
    data = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(data?.results)) {
      throw new Error("invalid");
    }
  } catch (e) {
    console.error("Failed to parse pending file:", path, e);
    try {
      unlinkSync(path);
    } catch (e) {
      console.warn("Failed to clean up pending file:", path, e);
    }
    return { stdout: "", exitCode: 0 };
  }

  try {
    unlinkSync(path);
  } catch (e) {
    console.warn("Failed to clean up pending file:", path, e);
  }

  const stdout = formatPendingOutput(data.results);
  return { stdout, exitCode: 0 };
}
