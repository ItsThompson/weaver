import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { readSessions, isProcessRunning } from './storage/index';
import { getLastEvent, deriveActivity } from './log-parser/index';
import { log } from '../utils/logger';

const POLL_INTERVAL_MS = 60_000;
const SCRIPT_PATH = join(import.meta.dirname, '..', '..', '..', 'bin', 'keep-awake.sh');
const ACTIVE_STATES = new Set(['processing', 'running_tool']);

async function hasActiveSessions(): Promise<boolean> {
  const sessions = await readSessions();
  for (const s of sessions) {
    if (!isProcessRunning(s.pid)) continue;
    const last = await getLastEvent(s.id);
    const activity = deriveActivity(last?.name ?? 'agentSpawn', last?.timestamp);
    if (ACTIVE_STATES.has(activity)) return true;
  }
  return false;
}

let interval: ReturnType<typeof setInterval> | null = null;

export function startKeepAwake(): void {
  const poll = async () => {
    try {
      if (await hasActiveSessions()) {
        execFile('bash', [SCRIPT_PATH], (err) => {
          if (err) log({ timestamp: new Date().toISOString(), event: 'keep_awake_error', error: String(err) });
        });
        log({ timestamp: new Date().toISOString(), event: 'keep_awake', message: 'active session detected — pressed fn' });
      }
    } catch (err) {
      log({ timestamp: new Date().toISOString(), event: 'keep_awake_poll_error', error: String(err) });
    }
  };

  poll();
  interval = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopKeepAwake(): void {
  if (interval) { clearInterval(interval); interval = null; }
}
