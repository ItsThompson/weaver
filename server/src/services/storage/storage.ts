import { execFileSync } from 'node:child_process';
import { WeaverDb } from '@weaver/shared/db';
import type { SessionRow } from '@weaver/shared/db';
import type { Session } from '@weaver/shared/types';
import { log } from '../../utils/logger';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const PID_POLL_INTERVAL_MS = 30 * 1000;

let db: WeaverDb | null = null;

export function getDb(): WeaverDb {
  if (!db) {
    db = new WeaverDb();
  }
  return db;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    pid: row.pid ?? 0,
    customName: row.custom_name,
    cwd: row.cwd,
    agentName: row.agent_name,
    startTime: row.created_at,
    lastEventTime: row.updated_at,
  };
}

export async function readSessions(): Promise<Session[]> {
  return getDb().listSessions().map(rowToSession);
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    const args = execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf-8' });
    return args.includes('kiro-cli');
  } catch {
    return false;
  }
}

export async function cleanStaleSessions(): Promise<void> {
  const database = getDb();
  const sessions = database.listSessions().filter((s) => s.status === 'open' && s.pid != null);

  for (const session of sessions) {
    if (!isProcessRunning(session.pid!)) {
      database.updateSession(session.id, { status: 'closed' });
      log({ timestamp: new Date().toISOString(), event: 'stale_session_closed', sessionId: session.id, pid: session.pid });
    }
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let pidPollInterval: ReturnType<typeof setInterval> | null = null;
const openPids = new Set<number>();

export function startStaleSessionCleanup(): void {
  cleanStaleSessions();
  cleanupInterval = setInterval(cleanStaleSessions, CLEANUP_INTERVAL_MS);
}

export function startPidPolling(onSessionClosed: (sessionId: string) => void): void {
  const poll = async () => {
    const sessions = await readSessions();
    const currentlyOpen = sessions.filter((s) => isProcessRunning(s.pid));
    const currentPids = new Set(currentlyOpen.map((s) => s.pid));

    for (const pid of openPids) {
      if (!currentPids.has(pid)) {
        const session = sessions.find((s) => s.pid === pid);
        if (session) onSessionClosed(session.id);
      }
    }

    openPids.clear();
    for (const pid of currentPids) openPids.add(pid);
  };

  poll();
  pidPollInterval = setInterval(poll, PID_POLL_INTERVAL_MS);
}

export function stopStaleSessionCleanup(): void {
  if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
  if (pidPollInterval) { clearInterval(pidPollInterval); pidPollInterval = null; }
}
