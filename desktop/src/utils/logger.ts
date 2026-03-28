export interface LogEntry {
  timestamp: string;
  event: string;
  [key: string]: unknown;
}

export function log(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}
