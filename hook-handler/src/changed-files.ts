import { getCurrentTurnEvents } from './turn-boundary.js';

export function extractChangedFiles(sessionLogPath: string): string[] {
  const events = getCurrentTurnEvents(sessionLogPath);
  const files = events.reduce((acc, e) => {
    if (
      e.event.hook_event_name === 'postToolUse' &&
      e.event.tool_name === 'fs_write' &&
      typeof e.event.tool_input?.path === 'string'
    ) {
      acc.add(e.event.tool_input.path);
    }
    return acc;
  }, new Set<string>());

  return [...files];
}
