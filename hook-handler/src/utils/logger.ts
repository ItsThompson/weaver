export interface LogEntry {
  timestamp: string;
  event: string;
  [key: string]: unknown;
}

// Writes to stderr because stdout is reserved for hook output consumed by kiro-cli
export function log(entry: LogEntry): void {
  console.error(JSON.stringify(entry));
}
