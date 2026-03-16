import { join } from "node:path";
import { homedir } from "node:os";

/** Expands a leading `~/` to the user's home directory. */
export function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}
