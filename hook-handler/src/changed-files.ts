import { getCurrentTurnEvents } from './turn-boundary.js';

export function extractChangedFiles(sessionLogPath: string): string[] {
  const events = getCurrentTurnEvents(sessionLogPath);
  const files = new Set<string>();

  for (const e of events) {
    if (
      e.event.hook_event_name === 'postToolUse' &&
      e.event.tool_name === 'fs_write' &&
      e.event.tool_input?.path &&
      typeof e.event.tool_input.path === 'string'
    ) {
      files.add(e.event.tool_input.path);
    }
  }

  return [...files];
}
