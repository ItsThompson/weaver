export function formatDuration(start: string, end?: string): string {
  if (!end) return 'pending';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}