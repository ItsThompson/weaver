import { mkdir, readFile, appendFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Session } from '@shared/types.js';
import { log } from '../utils/logger.js';

const DATA_DIR = () => join(homedir(), '.weaver');
const LOGS_DIR = () => join(DATA_DIR(), 'logs');
const SESSIONS_FILE = () => join(DATA_DIR(), 'sessions.jsonl');

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export async function ensureDataDir(): Promise<void> {
  try {
    await mkdir(DATA_DIR(), { recursive: true });
    await mkdir(LOGS_DIR(), { recursive: true });
  } catch (err) {
    log({ timestamp: new Date().toISOString(), event: 'ensure_data_dir_failed', error: String(err) });
    throw err;
  }
}

export async function readSessions(): Promise<Session[]> {
  const filePath = SESSIONS_FILE();
  if (!existsSync(filePath)) return [];

  const content = await readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .reduce<Session[]>((sessions, line) => {
      try {
        sessions.push(JSON.parse(line) as Session);
      } catch {
        log({ timestamp: new Date().toISOString(), event: 'malformed_session_line', line });
      }
      return sessions;
    }, []);
}

export async function appendSession(session: Session): Promise<void> {
  await appendFile(SESSIONS_FILE(), JSON.stringify(session) + '\n', 'utf-8');
}

export async function cleanStaleSessions(): Promise<void> {
  const dataDir = DATA_DIR();
  let entries: string[];
  try {
    entries = await readdir(dataDir);
  } catch {
    return;
  }

  const sessionFiles = entries.filter((f) => f.startsWith('.current-session-'));

  for (const file of sessionFiles) {
    const pid = parseInt(file.replace('.current-session-', ''), 10);
    if (isNaN(pid)) continue;

    if (!isProcessRunning(pid)) {
      try {
        await unlink(join(dataDir, file));
        log({ timestamp: new Date().toISOString(), event: 'stale_session_cleaned', pid, file });
      } catch {
        // File may have been removed between readdir and unlink
      }
    }
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startStaleSessionCleanup(): void {
  cleanStaleSessions();
  cleanupInterval = setInterval(cleanStaleSessions, CLEANUP_INTERVAL_MS);
}

export function stopStaleSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
