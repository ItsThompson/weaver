/** User-facing output to stdout — human-readable, not structured */
export function print(...args: unknown[]): void {
  console.log(...args);
}

/** User-facing error output to stderr — human-readable, not structured */
export function printError(...args: unknown[]): void {
  console.error(...args);
}

/** Structured diagnostic log to stderr — machine-parseable */
export function cliLog(event: string, data?: Record<string, unknown>): void {
  console.error(
    JSON.stringify({ timestamp: new Date().toISOString(), event, ...data }),
  );
}
