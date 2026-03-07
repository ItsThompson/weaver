import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SessionRow, MessageRow, ToolCallRow, EventRow } from './types';

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_session_id TEXT,
  pid INTEGER,
  cwd TEXT NOT NULL,
  agent_name TEXT,
  custom_name TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  context_usage_percent REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id),
  tool_name TEXT NOT NULL,
  kind TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT,
  output TEXT,
  permission_response TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id, started_at);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_session ON events(session_id, created_at);

CREATE TABLE schema_version (
  version INTEGER NOT NULL
);
INSERT INTO schema_version (version) VALUES (${SCHEMA_VERSION});
`;

function defaultDbPath(): string {
  const dir = join(homedir(), '.weaver');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'weaver.sqlite3');
}

export class WeaverDb {
  private db: DatabaseType;

  constructor(options?: { readonly?: boolean; dbPath?: string }) {
    const isReadonly = options?.readonly ?? false;
    const dbPath = options?.dbPath ?? (isReadonly ? join(homedir(), '.weaver', 'weaver.sqlite3') : defaultDbPath());

    this.db = new Database(dbPath, { readonly: isReadonly });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');

    if (!isReadonly) {
      this.applySchema();
    }
  }

  private applySchema(): void {
    try {
      const row = this.db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
      if (row && row.version >= SCHEMA_VERSION) return;
    } catch {
      // Table doesn't exist yet — apply schema
    }
    this.db.exec(SCHEMA_SQL);
  }

  private queryOne<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  private queryAll<T>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  // --- Sessions ---

  createSession(session: Omit<SessionRow, 'updated_at'>): void {
    const now = session.created_at;
    this.db.prepare(`
      INSERT INTO sessions (id, agent_session_id, pid, cwd, agent_name, custom_name, model, status, context_usage_percent, created_at, updated_at)
      VALUES (@id, @agent_session_id, @pid, @cwd, @agent_name, @custom_name, @model, @status, @context_usage_percent, @created_at, @updated_at)
    `).run({ ...session, updated_at: now });
  }

  getSession(id: string): SessionRow | null {
    return this.queryOne<SessionRow>('SELECT * FROM sessions WHERE id = ?', id) ?? null;
  }

  listSessions(): SessionRow[] {
    return this.queryAll<SessionRow>('SELECT * FROM sessions ORDER BY created_at DESC');
  }

  updateSession(id: string, updates: Partial<Pick<SessionRow, 'agent_session_id' | 'pid' | 'custom_name' | 'model' | 'status' | 'context_usage_percent'>>): void {
    const fields = Object.keys(updates).filter((k) => updates[k as keyof typeof updates] !== undefined);
    if (fields.length === 0) return;

    const sets = [...fields.map((f) => `${f} = @${f}`), 'updated_at = @updated_at'].join(', ');
    this.db.prepare(`UPDATE sessions SET ${sets} WHERE id = @id`).run({
      ...updates,
      updated_at: new Date().toISOString(),
      id,
    });
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  // --- Messages ---

  appendMessage(msg: Omit<MessageRow, 'id'>): number {
    const result = this.db.prepare(`
      INSERT INTO messages (session_id, role, type, content, metadata, created_at)
      VALUES (@session_id, @role, @type, @content, @metadata, @created_at)
    `).run(msg);
    return Number(result.lastInsertRowid);
  }

  getMessages(sessionId: string): MessageRow[] {
    return this.queryAll<MessageRow>('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', sessionId);
  }

  // --- Tool Calls ---

  upsertToolCall(tc: ToolCallRow): void {
    this.db.prepare(`
      INSERT INTO tool_calls (id, session_id, message_id, tool_name, kind, status, input, output, permission_response, started_at, completed_at)
      VALUES (@id, @session_id, @message_id, @tool_name, @kind, @status, @input, @output, @permission_response, @started_at, @completed_at)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        output = excluded.output,
        permission_response = excluded.permission_response,
        completed_at = excluded.completed_at
    `).run(tc);
  }

  getToolCalls(sessionId: string): ToolCallRow[] {
    return this.queryAll<ToolCallRow>('SELECT * FROM tool_calls WHERE session_id = ? ORDER BY started_at ASC', sessionId);
  }

  // --- Events ---

  appendEvent(evt: Omit<EventRow, 'id'>): void {
    this.db.prepare(`
      INSERT INTO events (session_id, event_type, data, created_at)
      VALUES (@session_id, @event_type, @data, @created_at)
    `).run(evt);
  }

  getEvents(sessionId: string): EventRow[] {
    return this.queryAll<EventRow>('SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC', sessionId);
  }

  // --- Lifecycle ---

  close(): void {
    this.db.close();
  }
}
