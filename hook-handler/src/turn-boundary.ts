import { readFileSync, existsSync } from 'node:fs';
import type { HookEvent } from '@weaver/shared/types';

export function getCurrentTurnEvents(sessionLogPath: string): HookEvent[] {
  if (!existsSync(sessionLogPath)) return [];

  let raw: string;
  try {
    raw = readFileSync(sessionLogPath, 'utf-8');
  } catch {
    return [];
  }

  const lines = raw.split('\n').filter((l) => l.trim());
  const events: HookEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as HookEvent);
    } catch {
      // skip malformed lines
    }
  }

  if (events.length === 0) return [];

  let boundaryIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const name = events[i].event.hook_event_name;
    if (name === 'userPromptSubmit' || name === 'agentSpawn') {
      boundaryIndex = i;
      break;
    }
  }

  return boundaryIndex === -1 ? events : events.slice(boundaryIndex);
}
