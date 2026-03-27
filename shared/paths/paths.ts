import { join } from "node:path";
import { homedir } from "node:os";

export const weaverDir = () => join(homedir(), ".weaver");
export const logsDir = () => join(weaverDir(), "logs");
export const configPath = () => join(weaverDir(), "config.json");
export const sessionsPath = () => join(weaverDir(), "sessions.jsonl");
export const sessionLogPath = (sessionId: string) =>
  join(logsDir(), `${sessionId}.jsonl`);
export const pendingPath = (sessionId: string) =>
  join(logsDir(), `${sessionId}.pending`);
export const sessionMarkerPath = (pid: number) =>
  join(weaverDir(), `.current-session-${pid}`);
export const orphanPath = () => join(logsDir(), "orphan.jsonl");
export const globalSkillsPath = () => join(globalKiroDir(), "skills");
export const globalKiroDir = () => join(homedir(), ".kiro");

export function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}
