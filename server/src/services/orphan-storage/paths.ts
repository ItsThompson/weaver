import { join } from "node:path";
import { homedir } from "node:os";

export const ORPHAN_PATH = () =>
  join(homedir(), ".weaver", "logs", "orphan.jsonl");
export const LOGS_DIR = () => join(homedir(), ".weaver", "logs");
