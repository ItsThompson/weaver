export function formatDuration(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}
