-- Weaver SQLite Schema v1
-- Enable WAL mode for concurrent readers + writer
PRAGMA journal_mode=WAL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                -- UUID
  agent_session_id TEXT,              -- ACP session ID from agent
  pid INTEGER,                        -- kiro-cli acp process ID
  cwd TEXT NOT NULL,                  -- working directory
  agent_name TEXT,                    -- agent identifier (e.g. "kiro")
  custom_name TEXT,                   -- user-assigned name
  model TEXT,                         -- model ID (e.g. "claude-opus-4.6-1m")
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  context_usage_percent REAL,         -- latest context window usage %
  created_at TEXT NOT NULL,           -- ISO 8601
  updated_at TEXT NOT NULL            -- ISO 8601
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                 -- 'user' | 'assistant' | 'system'
  type TEXT NOT NULL,                 -- 'text' | 'tool_use' | 'tool_result' | 'command'
  content TEXT,                       -- message text content
  metadata TEXT,                      -- JSON blob for extra data (tool calls, etc.)
  created_at TEXT NOT NULL,           -- ISO 8601
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,                -- toolCallId from ACP
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id),
  tool_name TEXT NOT NULL,
  kind TEXT,                          -- 'read' | 'edit' | 'execute' | etc.
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed' | 'failed'
  input TEXT,                         -- JSON stringified input
  output TEXT,                        -- JSON stringified output/content
  permission_response TEXT,           -- 'allow_once' | 'allow_always' | 'reject_once' | null
  started_at TEXT NOT NULL,           -- ISO 8601
  completed_at TEXT                   -- ISO 8601
);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id, started_at);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,           -- 'session_start' | 'prompt' | 'tool_call' | 'tool_result' | 'turn_end' | 'error' | 'compaction' | etc.
  data TEXT,                          -- JSON blob
  created_at TEXT NOT NULL            -- ISO 8601
);
CREATE INDEX idx_events_session ON events(session_id, created_at);

CREATE TABLE schema_version (
  version INTEGER NOT NULL
);
INSERT INTO schema_version (version) VALUES (1);
