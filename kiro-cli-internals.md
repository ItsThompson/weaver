# kiro-cli Internals Reference

Research notes on kiro-cli's internal data storage, file layout, and database schema. Gathered 2026-03-04 from kiro-cli v1.27.0.

## File System Layout

### Data directory

```
~/Library/Application Support/kiro-cli/
├── data.sqlite3          # 310MB — main database (conversations, auth, state, shell history)
├── history               # 678KB — YAML-formatted shell command history
├── .subagents/           # Subagent task results (JSON per agent)
│   ├── default.json
│   ├── builder.json
│   ├── code_search.json
│   ├── dev.json
│   ├── jest_test_runner.json
│   └── rspec_test_runner.json
└── shell/                # Shell integration scripts
    ├── zshrc.pre.zsh
    ├── zshrc.post.zsh
    ├── zprofile.pre.zsh
    ├── zprofile.post.zsh
    ├── bashrc.pre.bash
    ├── bashrc.post.bash
    └── ...
```

### Config directory

```
~/.config/amazonq/
├── global/
│   ├── settings/
│   │   ├── cli.json          # User settings (model, features, keybindings)
│   │   └── mcp.json          # MCP server configuration
│   ├── agents/               # Agent definitions
│   │   ├── default.json
│   │   ├── dev.json
│   │   ├── dev-prompt.md
│   │   ├── builder.json
│   │   ├── builder-prompt.md
│   │   └── ...
│   ├── hooks/                # Global hook scripts
│   │   └── weaver-log.sh
│   ├── prompts/              # Custom prompts
│   ├── skills/               # Skill definitions
│   │   └── <skill-name>/SKILL.md
│   └── docs/                 # Context docs
└── <workspace>/              # Per-workspace overrides
    ├── settings/
    ├── agents/
    └── skills/
```

### Log files

```
$TMPDIR/kiro-log/
├── kiro-chat.log     # Main chat log (780KB)
├── lsp.log           # LSP/code intelligence log (52KB)
└── mcp.log           # MCP server log (empty if no MCP servers)
```

Control verbosity: `KIRO_LOG_LEVEL=debug kiro-cli chat`

### Subagent task files

Each file in `.subagents/` stores the result of a delegated task:

```json
{
  "agent": "default",
  "task": "description of the task",
  "status": "completed",
  "launched_at": 1707840000,
  "completed_at": 1707840060,
  "pid": 12345,
  "exit_code": 0,
  "output": "task output...",
  "user_notified": true,
  "summary": "brief summary",
  "cwd": "/path/to/workspace"
}
```

## SQLite Database

Location: `~/Library/Application Support/kiro-cli/data.sqlite3`

### Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `conversations_v2` | 861 | Current conversation storage (multi-conversation per working dir) |
| `conversations` | 25 | Legacy conversation storage (1:1 per working dir, superseded by v2) |
| `history` | 916 | Shell command history (kiro-cli session launches) |
| `state` | 24 | Key-value app state (telemetry, auth, migration flags) |
| `auth_kv` | 4 | OAuth device registration and tokens |
| `migrations` | 9 | Schema migration tracking |

### conversations_v2

Primary conversation storage. Each row is one conversation session.

```sql
CREATE TABLE conversations_v2 (
    key TEXT NOT NULL,              -- working directory path
    conversation_id TEXT NOT NULL,  -- UUID
    value TEXT NOT NULL,            -- full conversation JSON (avg 366KB, max 8.5MB)
    created_at INTEGER NOT NULL,    -- unix timestamp in milliseconds
    updated_at INTEGER NOT NULL,    -- unix timestamp in milliseconds
    PRIMARY KEY (key, conversation_id)
);
CREATE INDEX idx_conversations_v2_key_updated ON conversations_v2(key, updated_at DESC);
CREATE INDEX idx_conversations_v2_updated_at ON conversations_v2(updated_at DESC);
```

Stats (as of 2026-03-04):
- 861 conversations
- Average value size: 366KB
- Max value size: 8.5MB
- Total data: 315MB
- Date range: 2026-01-02 to 2026-03-04

#### Useful queries

```sql
-- Most recent conversations
SELECT conversation_id, key, length(value) as bytes, 
       datetime(updated_at/1000, 'unixepoch') as updated
FROM conversations_v2 
ORDER BY updated_at DESC LIMIT 10;

-- Conversations for a specific working directory
SELECT conversation_id, datetime(created_at/1000, 'unixepoch') as created,
       datetime(updated_at/1000, 'unixepoch') as updated
FROM conversations_v2 
WHERE key = '/Users/thompsnt/Documents/weaver'
ORDER BY updated_at DESC;

-- Conversations by size
SELECT conversation_id, key, length(value) as bytes
FROM conversations_v2 
ORDER BY length(value) DESC LIMIT 10;
```

#### Conversation JSON schema

The `value` column contains a JSON blob:

```
{
  conversation_id       string       UUID
  next_message          null|object  Pending message (rare)
  history               array        Turn array (see below)
  valid_history_range   [int, int]   [start, end] indices of valid history
  transcript            array        Flat readable message list (strings)
  tools                 object       Tool definitions grouped by source
  context_manager       object       Context file config
  context_message_length int         Current context size in chars
  latest_summary        null|string  Compaction summary (if compacted)
  model_info            object       Model metadata
  file_line_tracker     object       Tracks agent file modifications
  checkpoint_manager    null|object  Checkpoint state
  mcp_enabled           bool         Whether MCP is active
  mcp_last_checked      array        Timestamp array [year, day, hour, min, sec, nanos, ...]
  mcp_server_versions   object       MCP server version tracking
  mcp_disabled_due_to_api_failure bool
  tangent_state         null|object  Present only when in tangent mode
  user_turn_metadata    object       Metadata for the current/last user turn
}
```

### History turn structure

Each entry in `history` is a turn:

```json
{
  "user": {
    "additional_context": "",
    "env_context": {
      "env_state": {
        "operating_system": "macos",
        "current_working_directory": "/path/to/project",
        "environment_variables": []
      }
    },
    "content": { "<ContentType>": { ... } },
    "timestamp": "2026-03-04T20:04:36.117492Z",
    "images": null
  },
  "assistant": { "<ResponseType>": { ... } },
  "request_metadata": { ... }
}
```

#### User content types

| Type | Keys | Description |
|------|------|-------------|
| `Prompt` | `prompt` | User-typed message |
| `ToolUseResults` | `tool_use_results` | Results returned from tool execution |
| `CancelledToolUses` | `prompt`, `tool_use_results` | User interrupted tool execution |

#### Assistant response types

| Type | Keys | Description |
|------|------|-------------|
| `Response` | `message_id`, `content` | Text response from the model |
| `ToolUse` | `message_id`, `content`, `tool_uses` | Model requested tool invocations |

#### ToolUse detail

```json
{
  "message_id": "uuid",
  "content": "optional text before tool calls",
  "tool_uses": [
    {
      "id": "tooluse_PJ78kv5nT3inK7vr0pPRXz",
      "name": "execute_bash",
      "orig_name": "execute_bash",
      "args": { "command": "ls -la", "summary": "list files" },
      "orig_args": { ... }
    }
  ]
}
```

#### ToolUseResults detail

```json
{
  "tool_use_results": [
    {
      "tool_use_id": "tooluse_PJ78kv5nT3inK7vr0pPRXz",
      "content": [{ "Json": { ... } }],
      "status": "Success"
    }
  ]
}
```

Status values: `Success`, `Error`

#### CancelledToolUses detail

Appears when the user interrupts a tool execution (Ctrl+C):

```json
{
  "prompt": "The user interrupted the tool execution.",
  "tool_use_results": [
    {
      "tool_use_id": "tooluse_xxx",
      "content": [{ "Text": "Tool use was cancelled by the user" }],
      "status": "Error"
    }
  ]
}
```

### request_metadata

Attached to each turn in `history`:

```json
{
  "request_id": "f4c8c03b-98bf-4609-9f1f-6531749550c9",
  "context_usage_percentage": 1.5302,
  "message_id": "6ed4ef98-4260-4698-94c2-83a5350a6d03",
  "request_start_timestamp_ms": 1772654676289,
  "stream_end_timestamp_ms": 1772654690100,
  "time_to_first_chunk": { "secs": 2, "nanos": 550210125 },
  "time_between_chunks": [ { "secs": 0, "nanos": 35271333 }, ... ],
  "user_prompt_length": 256,
  "response_size": 1649,
  "chat_conversation_type": "Response",
  "tool_use_ids_and_names": [["tooluse_xxx", "execute_bash"]],
  "model_id": "claude-opus-4.6-1m",
  "message_meta_tags": []
}
```

`chat_conversation_type` values: `"Response"`, `"ToolUse"`

### user_turn_metadata

Aggregated metadata for the most recent user turn (top-level field, not per-history-entry):

```json
{
  "continuation_id": "uuid",
  "requests": [
    {
      // Same structure as request_metadata above
      // One entry per model request in the turn
      // (a single user prompt can trigger multiple requests if tools are involved)
    }
  ],
  "usage_info": [
    { "value": 0.399, "unit": "credit", "unit_plural": "credits" },
    { "value": 0.448, "unit": "credit", "unit_plural": "credits" }
  ]
}
```

`usage_info` contains one entry per model request in the turn, representing the credit cost.

### model_info

```json
{
  "model_name": "claude-opus-4.6-1m",
  "description": "[Internal] Experimental preview of Claude Opus 4.6 1M context window model",
  "model_id": "claude-opus-4.6-1m",
  "context_window_tokens": 1000000,
  "rate_multiplier": 2.2,
  "rate_unit": "Credit"
}
```

### context_manager

```json
{
  "max_context_files_size": 750000,
  "current_profile": "dev",
  "paths": [
    "AGENTS.md",
    "README.md",
    "/Users/thompsnt/.config/amazonq/global/docs/*.md",
    "~/.config/amazonq/global/skills/*/SKILL.md"
  ],
  "hooks": {
    "stop": [ ... ],
    "userPromptSubmit": [ ... ],
    "agentSpawn": [ ... ],
    "preToolUse": [ ... ],
    "postToolUse": [ ... ]
  }
}
```

### tangent_state

Only present when the user is in tangent mode. Absent (null) otherwise.

```json
{
  "main_history": [],
  "main_next_message": null,
  "main_transcript": [],
  "main_latest_summary": null,
  "tangent_start_time": [2026, 63, 21, 45, 12, 819902000, 0, 0, 0]
}
```

| Field | Description |
|-------|-------------|
| `main_history` | Frozen copy of the history array at the point tangent mode was entered |
| `main_transcript` | Frozen copy of the transcript |
| `main_next_message` | Frozen next_message state |
| `main_latest_summary` | Frozen compaction summary |
| `tangent_start_time` | Timestamp array: [year, ordinal_day, hour, min, sec, nanos, 0, 0, 0] |

When tangent mode is active, the top-level `history` and `transcript` contain the tangent branch. The `main_*` fields preserve the state to restore when exiting tangent mode.

### tools

Tool definitions grouped by source:

```json
{
  "native___": [
    {
      "ToolSpecification": {
        "name": "introspect",
        "description": "...",
        "input_schema": { "json": { ... } }
      }
    },
    // ... 16 native tools total
  ],
  "sequential-thinking": [
    {
      "ToolSpecification": {
        "name": "sequentialthinking",
        "description": "...",
        "input_schema": { "json": { ... } }
      }
    }
  ]
}
```

Native tools observed: `introspect`, `execute_bash`, `glob`, `grep`, `fs_read`, `fs_write`, `code`, `use_aws`, `web_search`, `web_fetch`, `use_subagent`, `delegate`, `report_issue`, `session`, `thinking`, `knowledge`

### file_line_tracker

Tracks file modifications made by the agent:

```json
{
  "/path/to/file.md": {
    "prev_fswrite_lines": 440,
    "before_fswrite_lines": 0,
    "after_fswrite_lines": 440,
    "lines_added_by_agent": 440,
    "lines_removed_by_agent": 0,
    "is_first_write": false
  }
}
```

### transcript

Flat array of readable strings representing the conversation. Alternates between user prompts (prefixed with `> `) and assistant responses. Tool uses are summarized as `[Tool uses: tool1, tool2]`.

```
[
  "> is there a way to programatically respond to kiro",
  "\n\nNot directly — kiro-cli doesn't expose...",
  "> use your introspect tool to take a look",
  "\n[Tool uses: introspect]",
  "Well, I stand corrected — there's actually...",
  ...
]
```

## Other Tables

### history (shell command history)

Records each kiro-cli session launch:

```sql
CREATE TABLE history (
    id INTEGER PRIMARY KEY,
    command TEXT,          -- truncated command/path
    shell TEXT,            -- "zsh", "bash"
    pid INTEGER,           -- process ID
    session_id TEXT,        -- shell session UUID
    cwd TEXT,              -- working directory
    start_time INTEGER,    -- unix timestamp (seconds)
    hostname TEXT,
    exit_code INTEGER,
    end_time INTEGER,
    duration INTEGER
);
```

### state (app state key-value)

General application state. Notable keys:

| Key | Type | Description |
|-----|------|-------------|
| `telemetryClientId` | text | 38-char client identifier |
| `migration.kiro.completed` | text | Whether kiro migration ran |
| `migration.kiro.was_q_user` | text | Whether user migrated from Q |
| `changelog.lastVersion` | text | Last seen version |
| `auth.idc.start-url` | text | IdC auth URL |
| `auth.idc.region` | text | Auth region |
| `desktop.completedOnboarding` | text | Onboarding status |
| `telemetry-cognito-credentials` | text | 1.7KB cognito credential blob |

### auth_kv (authentication)

OAuth device registration and tokens:

| Key | Size | Description |
|-----|------|-------------|
| `codewhisperer:odic:device-registration` | 4.1KB | CodeWhisperer OIDC registration |
| `codewhisperer:odic:token` | 723B | CodeWhisperer OIDC token |
| `kirocli:odic:device-registration` | 4.1KB | kiro-cli OIDC registration |
| `kirocli:odic:token` | 726B | kiro-cli OIDC token |

### migrations

Schema version tracking:

```sql
CREATE TABLE migrations (
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL,      -- 0 through 8 (9 migrations total)
    migration_time INTEGER NOT NULL -- unix timestamp (seconds)
);
```

Two migration batches observed:
- Versions 0-5: migrated at 1756904048 (initial setup)
- Versions 6-7: migrated at 1756904369 (same day)
- Version 8: migrated at 1767389539 (later update)

## Timestamp Formats

kiro-cli uses multiple timestamp formats across the database:

| Location | Format | Example |
|----------|--------|---------|
| `conversations_v2.created_at` | Unix ms | `1772654690180` |
| `conversations_v2.updated_at` | Unix ms | `1772656214231` |
| `history.start_time` | Unix seconds | `1772654234` |
| `migrations.migration_time` | Unix seconds | `1756904048` |
| `request_metadata.request_start_timestamp_ms` | Unix ms | `1772654676289` |
| `user.timestamp` | ISO 8601 | `"2026-03-04T20:04:36.117492Z"` |
| `tangent_state.tangent_start_time` | Array | `[2026, 63, 21, 45, 12, 819902000, 0, 0, 0]` |
| `mcp_last_checked` | Array | `[2026, 63, 20, 4, 29, 434118000, 0, 0, 0]` |

The array format appears to be: `[year, ordinal_day, hour, minute, second, nanoseconds, 0, 0, 0]`

## Context Window Percentage

Stored in `request_metadata.context_usage_percentage` per turn. Calculated server-side:

```
contextUsagePercentage = (inputTokens / context_window_tokens) * 100
```

Where `inputTokens` comes from the model provider's API response and `context_window_tokens` is from `model_info` (e.g., 1,000,000 for claude-opus-4.6-1m).

Cannot be replicated externally: requires the provider's tokenizer and knowledge of all injected context (system prompts, skills, context files).
