# Weaver ACP Client: Implementation Plan

## Overview

Build a custom ACP (Agent Client Protocol) client within the Weaver monorepo that replaces `kiro-cli chat` as the terminal interface. The client spawns `kiro-cli acp` as a child process over stdio, drives conversations via the ACP protocol using `@agentclientprotocol/sdk`, and stores all conversation data in a shared SQLite database (`~/.weaver/weaver.sqlite3`). The existing weaver server is refactored to read from SQLite instead of JSONL files, so the Electron dashboard continues working with richer data.

### Coding Standards (apply to all steps)

These standards are enforced across every step. Agents should treat violations as blockers.

- **ESM only**: `import`/`export`, `node:` prefix for builtins, named exports (never default)
- **Types in dedicated files**: `types.ts` or `schemas.ts`, separate from implementation
- **One responsibility per file**: section comments like `// --- Foo ---` mean the file should be split
- **Guard clauses**: prefer early returns over nested conditionals
- **Structured logging**: use a shared `log()` function outputting JSON with `timestamp` and `event` fields. No ad-hoc `console.log`.
- **Lazy initialization**: DB connections, SDK clients, and expensive resources created on first use, not at module level. Never read `process.env` at module level.
- **Data safety (SQLite)**: WAL mode + busy timeout (5s). Never open a file for writing while processing its contents. Validate row counts after bulk operations.
- **Testing**: unit tests for all non-trivial logic. In-memory SQLite for tests. Never weaken a test to make it pass: fix mocks/setup, not assertions. Match existing repo conventions.

### Success Criteria

- `weaver chat` launches a functional TUI that connects to `kiro-cli acp` over ACP
- User can send prompts, receive streamed markdown responses, and approve/reject tool calls
- All conversation data (messages, tool calls, events) persisted to SQLite
- Weaver dashboard displays sessions and conversation content from SQLite
- Session resume works via `weaver chat --resume <id>` and `/chat load`
- Slash commands route correctly: local commands handled by TUI, agent commands forwarded via `_kiro.dev/commands/execute`
- $EDITOR integration works for `/editor`, `/reply`, and keyboard shortcuts
- MCP servers read from kiro's config and passed through on `session/new`
- Multiple concurrent `weaver chat` instances can write to the same SQLite DB without corruption
- Existing dashboard features (session list, session detail, orphans, webhooks, SSE updates) continue working

### Assumptions

- `kiro-cli` is installed and available on PATH (binary is `kiro-cli-chat acp`)
- Node.js 20+
- macOS (Linux support is a future concern)
- `$EDITOR` environment variable is set (falls back to `vi`)
- The weaver server and Electron app are running as separate processes
- kiro-cli's MCP config lives at `~/.kiro/settings/mcp.json` (global) and `.kiro/settings/mcp.json` (workspace)

### Constraints

- kiro-cli acp is the only supported agent for now; architecture must support future agents without major refactoring
- Image support in prompts is out of scope
- Context tree UX, variable expansion, and validation hooks are out of scope
- The React dashboard (client package) should require minimal changes — the API contract between server and client stays the same where possible
## Approach

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  weaver chat (TUI process)                                │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  acp-client package                                   │ │
│  │                                                       │ │
│  │  ┌──────────────────┐  ┌───────────────────────────┐ │ │
│  │  │ ACP Core         │  │ Kiro Agent Adapter        │ │ │
│  │  │ (agent-agnostic) │  │ (_kiro.dev/* extensions,  │ │ │
│  │  │                  │  │  MCP config reading,      │ │ │
│  │  │                  │  │  slash cmd forwarding)    │ │ │
│  │  └────────┬─────────┘  └────────────┬──────────────┘ │ │
│  │           │                         │                  │ │
│  │  ┌────────▼─────────────────────────▼────────────────┐│ │
│  │  │ @agentclientprotocol/sdk                           ││ │
│  │  │ ClientSideConnection + ndJsonStream                ││ │
│  │  └────────────────────┬──────────────────────────────┘│ │
│  └───────────────────────┼───────────────────────────────┘ │
│                          │ stdio (JSON-RPC)                 │
│                          ▼                                  │
│                kiro-cli acp (child process)                 │
│                                                             │
│  ┌───────────────────┐  ┌──────────────────────────────┐   │
│  │ TUI Layer         │  │ SQLite (~/.weaver/weaver.db) │   │
│  │ readline + $EDITOR│  │ sessions, messages,          │   │
│  │ + slash commands   │  │ tool calls, events           │   │
│  └───────────────────┘  └──────────────┬───────────────┘   │
│                                        │ reads              │
│  ┌─────────────────────────────────────▼────────────────┐  │
│  │ weaver-server (Fastify)                               │  │
│  │ refactored: SQLite queries instead of JSONL           │  │
│  └─────────────────────────┬────────────────────────────┘  │
│                            │ SSE                            │
│  ┌─────────────────────────▼────────────────────────────┐  │
│  │ weaver-client (React dashboard) / Electron            │  │
│  │ unchanged: consumes server API                        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **Two-layer ACP client**: The `acp-client` package has a generic ACP core layer that handles protocol mechanics (initialize, session management, prompt/response lifecycle, Client interface implementation) and a kiro-specific adapter layer that handles `_kiro.dev/*` extensions, MCP config reading, and slash command forwarding. This separation means adding a new agent (e.g., Gemini CLI) only requires a new adapter, not changes to the core.

2. **Single SQLite database**: Both the ACP client (writer) and the weaver server (reader) share `~/.weaver/weaver.sqlite3`. SQLite handles concurrent readers natively. Multiple ACP client instances (multiple terminals) can write concurrently using WAL mode. The server never writes to the DB — it only reads.

3. **Slash command routing**: Commands are categorized as local (TUI-only), forwarded (sent to agent via `_kiro.dev/commands/execute`), or hybrid (both). Each command is a typed object with a handler function and optional keyboard shortcut. The kiro adapter registers the forwarded commands; the TUI registers local commands. This is extensible — future agents register their own commands.

4. **Client capabilities**: We advertise `fs.readTextFile`, `fs.writeTextFile`, and `terminal` capabilities to the agent. This gives us visibility into file operations and command execution, which surfaces in both the TUI and the dashboard. The implementations are thin wrappers that execute the operation and log it to SQLite.

5. **SSE event bridge**: The ACP client notifies the weaver server via HTTP POST to `/api/notify` on significant events (session start, prompt, tool call, turn end). This triggers SSE broadcasts to the dashboard. The server reads full data from SQLite on demand — the notify call is just a signal.

6. **Hook handler simplified**: `weaver-log.sh` is kept but simplified. It no longer writes JSONL event logs (the ACP client handles that via SQLite). It's retained as a lightweight signal mechanism for future validation hooks. The hook writes a minimal marker file and calls the server notify endpoint.

7. **MCP config passthrough**: On `session/new`, the kiro adapter reads MCP server configs from `~/.kiro/settings/mcp.json` (global) and `.kiro/settings/mcp.json` (workspace, relative to cwd). These are merged and passed as the `mcpServers` parameter. This keeps MCP config as a single source of truth in kiro's config files.

### Alternative Approaches Considered

- **JSONL preservation**: Keep JSONL as the storage format and have the ACP client write JSONL files like the hook handler does. Rejected because SQLite provides better query performance, atomic writes, and concurrent access — all needed for the richer data the ACP client captures.

- **Server as write proxy**: Have the ACP client send all data to the server via HTTP, and let the server write to SQLite. Rejected because it adds latency, creates a dependency on the server being running, and means the TUI can't function standalone.

- **Separate ACP client binary**: Build the ACP client as a standalone binary outside the weaver monorepo. Rejected because it shares types, config, and the SQLite schema with the server — keeping it in the monorepo avoids duplication.
## Implementation Steps

### Step 1: Create the shared SQLite schema and database module

Create a new `db` directory under `shared/` that defines the SQLite schema and provides a typed read/write API. This module is imported by both the ACP client (read+write) and the server (read-only).

**SQLite schema:**

```sql
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
```

**Module API (`shared/db/`):**

```typescript
// shared/db/index.ts — exports
export { WeaverDb } from './weaver-db';
export type { SessionRow, MessageRow, ToolCallRow, EventRow } from './types';

// shared/db/types.ts — row types matching the schema
export interface SessionRow { ... }
export interface MessageRow { ... }
export interface ToolCallRow { ... }
export interface EventRow { ... }

// shared/db/weaver-db.ts — database wrapper
export class WeaverDb {
  constructor(options?: { readonly?: boolean });
  // Session operations
  createSession(session: Omit<SessionRow, 'updated_at'>): void;
  getSession(id: string): SessionRow | null;
  listSessions(): SessionRow[];
  updateSession(id: string, updates: Partial<SessionRow>): void;
  deleteSession(id: string): void;
  // Message operations
  appendMessage(msg: Omit<MessageRow, 'id'>): number;
  getMessages(sessionId: string): MessageRow[];
  // Tool call operations
  upsertToolCall(tc: ToolCallRow): void;
  getToolCalls(sessionId: string): ToolCallRow[];
  // Event operations
  appendEvent(evt: Omit<EventRow, 'id'>): void;
  getEvents(sessionId: string): EventRow[];
  // Lifecycle
  close(): void;
}
```

**Dependencies:** `better-sqlite3` added to `shared/package.json`.

**Files:**
- Create `shared/db/types.ts`
- Create `shared/db/schema.sql`
- Create `shared/db/weaver-db.ts`
- Create `shared/db/index.ts`
- Update `shared/package.json` — add `better-sqlite3`, `@types/better-sqlite3`, add `./db` export
- Update `shared/tsconfig.json` — include `db/` directory

**Acceptance criteria:**
- `WeaverDb` can be instantiated, creates the DB file at `~/.weaver/weaver.sqlite3` if it doesn't exist
- Schema is applied on first open (checked via `schema_version` table)
- All CRUD operations work with typed inputs/outputs
- Read-only mode works (for server)
- WAL mode is enabled
- Unit tests pass for all operations using an in-memory SQLite DB

---

### Step 2: Scaffold the `acp-client` package

Create the new package with its directory structure, dependencies, and build config. No implementation yet — just the skeleton.

**Package structure:**
```
acp-client/
  package.json
  tsconfig.json
  src/
    index.ts              # entry point: parse args, start TUI or show help
    core/
      connection.ts       # ACP connection lifecycle (spawn, initialize, shutdown)
      session.ts          # session management (new, load, prompt, cancel)
      client-handler.ts   # Client interface implementation (requestPermission, sessionUpdate, fs, terminal)
      types.ts            # internal types
    adapters/
      kiro/
        index.ts          # KiroAdapter class
        extensions.ts     # _kiro.dev/* extension handlers
        mcp-config.ts     # read kiro MCP config files
        commands.ts       # kiro-specific slash command registrations
    tui/
      index.ts            # TUI orchestrator
      input.ts            # readline + $EDITOR integration
      output.ts           # streaming markdown output
      commands.ts         # slash command registry and routing
      approval.ts         # tool approval prompt (y/n/t)
    storage/
      index.ts            # SQLite write operations (wraps WeaverDb)
      event-emitter.ts    # notify weaver server via HTTP
```

**package.json:**
```json
{
  "name": "@weaver/acp-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "bin": { "weaver-chat": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "NODE_OPTIONS='--experimental-vm-modules' npx jest"
  },
  "dependencies": {
    "@agentclientprotocol/sdk": "^0.15.0",
    "@weaver/shared": "*"
  },
  "devDependencies": {
    "@types/node": "^22.15.3",
    "typescript": "^5.8.3",
    "tsx": "^4.19.4",
    "@jest/globals": "^30.2.0",
    "jest": "^30.2.0",
    "ts-jest": "^29.4.6"
  }
}
```

**Files:**
- Create all directories and stub files listed above (each file exports an empty placeholder or TODO comment)
- Create `acp-client/package.json`
- Create `acp-client/tsconfig.json`
- Create `acp-client/jest.config.mjs`
- Update root `package.json` — add `acp-client` to workspaces
- Verify `turbo.json` picks up the new package

**Acceptance criteria:**
- `npm install` from root succeeds
- `turbo build` includes `@weaver/acp-client` in the dependency graph
- `tsc` compiles without errors (stub files only)
- Package structure matches the layout above

---

### Step 3: Implement ACP connection lifecycle

Implement the core connection module that spawns `kiro-cli acp` as a child process, establishes the ACP connection using `@agentclientprotocol/sdk`, and handles clean shutdown.

**`acp-client/src/core/connection.ts`:**

```typescript
import { spawn } from 'node:child_process';
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk';
import type { Client, InitializeResponse } from '@agentclientprotocol/sdk';

export interface ConnectionOptions {
  agentCommand: string;       // e.g. 'kiro-cli-chat'
  agentArgs: string[];        // e.g. ['acp']
  clientInfo: { name: string; version: string };
  createClient: (agent: ClientSideConnection) => Client;
}

export interface ActiveConnection {
  agent: ClientSideConnection;
  capabilities: InitializeResponse;
  pid: number;
  shutdown: () => Promise<void>;
}

export async function connect(options: ConnectionOptions): Promise<ActiveConnection> {
  // 1. Spawn child process
  // 2. Create ndJsonStream from stdin/stdout
  // 3. Create ClientSideConnection with the Client handler
  // 4. Call agent.initialize() with client capabilities
  // 5. Set up signal handlers for clean shutdown (SIGTERM/SIGINT → kill child)
  // 6. Return ActiveConnection
}
```

Key behaviors:
- Spawn `kiro-cli-chat acp` (note: actual binary is `kiro-cli-chat`, not `kiro-cli`)
- Advertise client capabilities: `fs: { readTextFile: true, writeTextFile: true }, terminal: true`
- Client info: `{ name: 'weaver', version: '<from package.json>' }`
- On shutdown: send SIGTERM to child, wait 2s, SIGKILL if still alive
- Use process groups to ensure child cleanup on parent exit
- Handle child process stderr (log to `~/.weaver/acp-client.log`)

**Files:**
- Implement `acp-client/src/core/connection.ts`
- Create `acp-client/src/core/types.ts` — shared internal types

**Acceptance criteria:**
- `connect()` successfully spawns `kiro-cli acp`, completes the initialize handshake, and returns agent capabilities
- `shutdown()` cleanly terminates the child process
- If the child process dies unexpectedly, the connection's `signal` aborts
- Unit tests mock the child process spawn and verify the initialize flow
### Step 4: Implement session management

Implement session creation, loading, and the prompt/response lifecycle.

**`acp-client/src/core/session.ts`:**

```typescript
import type { ClientSideConnection, SessionId, NewSessionResponse, PromptResponse, ContentBlock } from '@agentclientprotocol/sdk';

export interface SessionManager {
  createSession(cwd: string, mcpServers: McpServer[]): Promise<{ sessionId: SessionId; modes?: SessionModeState }>;
  loadSession(sessionId: SessionId, cwd: string, mcpServers: McpServer[]): Promise<void>;
  sendPrompt(sessionId: SessionId, content: ContentBlock[]): Promise<PromptResponse>;
  cancel(sessionId: SessionId): Promise<void>;
  setMode(sessionId: SessionId, modeId: string): Promise<void>;
}
```

Key behaviors:
- `createSession`: calls `agent.newSession({ cwd, mcpServers })`, stores session in SQLite, returns session ID and available modes
- `loadSession`: calls `agent.loadSession({ sessionId, cwd, mcpServers })`, receives replayed conversation via `sessionUpdate` notifications, stores all replayed messages in SQLite
- `sendPrompt`: calls `agent.prompt({ sessionId, prompt })`, returns when the turn completes (stop reason). Streamed updates arrive via the `Client.sessionUpdate` callback (handled in step 5).
- `cancel`: sends `agent.cancel({ sessionId })` notification
- `setMode`: calls `agent.setSessionMode({ sessionId, modeId })`

**Files:**
- Implement `acp-client/src/core/session.ts`

**Acceptance criteria:**
- `createSession` successfully creates a session and returns a session ID
- `loadSession` replays conversation history and stores messages in SQLite
- `sendPrompt` sends a prompt and resolves when the turn ends
- `cancel` interrupts an in-progress prompt
- Unit tests mock the `ClientSideConnection` and verify each flow

---

### Step 5: Implement the Client handler (sessionUpdate, requestPermission, fs, terminal)

Implement the ACP `Client` interface — this is the callback object that the agent calls into.

**`acp-client/src/core/client-handler.ts`:**

```typescript
import type { Client, SessionNotification, RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';

export interface ClientHandlerDeps {
  onMessageChunk: (sessionId: string, content: ContentBlock) => void;
  onToolCall: (sessionId: string, toolCall: ToolCall) => void;
  onToolCallUpdate: (sessionId: string, update: ToolCallUpdate) => void;
  onPlan: (sessionId: string, plan: Plan) => void;
  onModeChange: (sessionId: string, modeId: string) => void;
  onCommandsAvailable: (sessionId: string, commands: AvailableCommand[]) => void;
  requestApproval: (sessionId: string, request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  createTerminal: (command: string, args: string[], cwd: string) => Promise<{ terminalId: string }>;
  getTerminalOutput: (terminalId: string) => Promise<{ output: string; exitStatus?: { code: number } }>;
  releaseTerminal: (terminalId: string) => Promise<void>;
  waitForTerminalExit: (terminalId: string) => Promise<{ exitStatus: { code: number } }>;
  killTerminal: (terminalId: string) => Promise<void>;
}

export function createClientHandler(deps: ClientHandlerDeps): (agent: ClientSideConnection) => Client;
```

The `sessionUpdate` handler dispatches based on `update.sessionUpdate`:
- `agent_message_chunk` → `onMessageChunk` (accumulate text, write to SQLite, stream to TUI)
- `tool_call` → `onToolCall` (insert tool call row in SQLite, display in TUI)
- `tool_call_update` → `onToolCallUpdate` (update tool call row, display progress)
- `plan` → `onPlan` (display plan entries in TUI)
- `current_mode_update` → `onModeChange` (update TUI prompt indicator)
- `available_commands_update` → `onCommandsAvailable` (register agent commands in slash command registry)
- `user_message_chunk` → store (for session/load replay)

The `requestPermission` handler:
- Displays tool call details in TUI
- Prompts user with y/n/t
- Maps to ACP permission options: y → `allow_once`, t → `allow_always`, n → `reject_once`
- Returns the selected option ID

The `fs` and `terminal` methods:
- `readTextFile`: read file from disk, log to SQLite, return content
- `writeTextFile`: write file to disk, log to SQLite, return success
- `createTerminal`: spawn a shell process, track it, return terminal ID
- `terminalOutput`: return current stdout/stderr of tracked terminal
- `releaseTerminal`: kill terminal process, clean up
- `waitForTerminalExit`: wait for terminal process to exit
- `killTerminal`: send SIGTERM to terminal process

Extension handler (`extNotification`):
- `_kiro.dev/metadata` → update session's `context_usage_percent` in SQLite
- `_kiro.dev/compaction/status` → display compaction progress in TUI
- `_kiro.dev/clear/status` → display clear status in TUI
- `_kiro.dev/mcp/server_initialized` → log MCP server init
- `_kiro.dev/commands/available` → register available commands

**Files:**
- Implement `acp-client/src/core/client-handler.ts`

**Acceptance criteria:**
- All `sessionUpdate` types are dispatched to the correct callback
- `requestPermission` prompts the user and returns the correct option
- `readTextFile` and `writeTextFile` work correctly and log to SQLite
- Terminal operations spawn/track/kill processes correctly
- Extension notifications are handled (metadata updates context %)
- Unit tests verify dispatch logic with mock callbacks

---

### Step 6: Implement the Kiro agent adapter

Implement the kiro-specific layer that handles `_kiro.dev/*` extensions, reads MCP config, and registers forwarded slash commands.

**`acp-client/src/adapters/kiro/index.ts`:**

```typescript
export class KiroAdapter {
  constructor(private agent: ClientSideConnection);

  // Execute a slash command via _kiro.dev/commands/execute
  async executeCommand(sessionId: string, command: string): Promise<void>;

  // Get autocomplete options via _kiro.dev/commands/options
  async getCommandOptions(sessionId: string, partial: string): Promise<string[]>;

  // Read MCP server configs from kiro's config files
  static readMcpServers(cwd: string): McpServer[];

  // Register kiro-specific forwarded commands in the slash command registry
  registerCommands(registry: CommandRegistry): void;
}
```

**`acp-client/src/adapters/kiro/mcp-config.ts`:**

Reads and merges MCP server configs:
1. Read `~/.kiro/settings/mcp.json` (global)
2. Read `<cwd>/.kiro/settings/mcp.json` (workspace, if exists)
3. Workspace overrides global (by server name)
4. Convert to ACP `McpServer[]` format (stdio transport)

**`acp-client/src/adapters/kiro/commands.ts`:**

Registers forwarded commands. Each command definition:
```typescript
interface ForwardedCommand {
  name: string;           // e.g. 'compact'
  description: string;
  handler: (args: string) => Promise<void>;  // calls adapter.executeCommand
}
```

Forwarded commands: `/compact`, `/tools`, `/model`, `/context`, `/mcp`, `/usage`, `/agent`, `/chat`, `/prompts`, `/plan`, `/todos`, `/hooks`

**`acp-client/src/adapters/kiro/extensions.ts`:**

Handles kiro-specific extension notifications received via `Client.extNotification`:
- `_kiro.dev/metadata` → extract `contextUsagePercentage`, update session in SQLite
- `_kiro.dev/compaction/status` → emit compaction progress event
- `_kiro.dev/clear/status` → emit clear status event
- `_kiro.dev/mcp/server_initialized` → log server name
- `_kiro.dev/mcp/oauth_request` → log OAuth URL (open in browser in future)

**Files:**
- Implement `acp-client/src/adapters/kiro/index.ts`
- Implement `acp-client/src/adapters/kiro/mcp-config.ts`
- Implement `acp-client/src/adapters/kiro/commands.ts`
- Implement `acp-client/src/adapters/kiro/extensions.ts`

**Acceptance criteria:**
- `executeCommand` sends the correct `_kiro.dev/commands/execute` extension method
- `readMcpServers` correctly reads and merges global + workspace MCP configs
- Forwarded commands are registered in the command registry and dispatch to `executeCommand`
- Extension notifications are handled and update SQLite/TUI appropriately
- Unit tests verify MCP config merging, command registration, and extension handling
### Step 7: Implement the TUI — slash command registry

Build the slash command system: a registry of typed commands with handlers, descriptions, and optional keyboard shortcuts.

**`acp-client/src/tui/commands.ts`:**

```typescript
export interface SlashCommand {
  name: string;
  description: string;
  shortcut?: { key: string; ctrl?: boolean; shift?: boolean };  // e.g. { key: 'e', ctrl: true }
  handler: (args: string, context: CommandContext) => Promise<void>;
}

export interface CommandContext {
  sessionId: string;
  sendPrompt: (content: ContentBlock[]) => Promise<PromptResponse>;
  agent: ClientSideConnection;
  adapter: KiroAdapter;
  tui: TuiController;
  db: WeaverDb;
}

export class CommandRegistry {
  register(command: SlashCommand): void;
  get(name: string): SlashCommand | undefined;
  getAll(): SlashCommand[];
  findByShortcut(key: string, ctrl: boolean, shift: boolean): SlashCommand | undefined;
  handleInput(input: string, context: CommandContext): Promise<boolean>;  // returns true if handled as command
}
```

**Local commands registered by the TUI:**

| Command | Shortcut | Handler |
|---------|----------|---------|
| `/quit` | ctrl+c (2x) | Clean shutdown: cancel in-progress prompt, close connection, exit |
| `/editor` | ctrl+e | Open `$EDITOR` with temp file, send content as prompt on save+close |
| `/reply` | ctrl+r | Open `$EDITOR` with last N assistant messages quoted (default 1), send edited content |
| `/reply N` | — | Same as `/reply` but quotes the Nth most recent assistant messages |
| `/clear` | — | Hybrid: clear terminal output + forward to agent via `_kiro.dev/commands/execute` |
| `/help` | — | Display all registered commands with descriptions |

**Files:**
- Implement `acp-client/src/tui/commands.ts`

**Acceptance criteria:**
- Commands can be registered and looked up by name or shortcut
- `handleInput` correctly identifies `/command args` patterns and dispatches
- Non-command input returns false (caller sends as prompt)
- `/help` lists all registered commands
- Unit tests verify registration, lookup, and dispatch

---

### Step 8: Implement the TUI — input handling (readline + $EDITOR)

Build the input layer: readline for inline input with ctrl+j for newlines, and $EDITOR integration for multi-line composition.

**`acp-client/src/tui/input.ts`:**

```typescript
export interface InputController {
  // Start the readline loop. Calls onSubmit when user submits input.
  start(onSubmit: (input: string) => Promise<void>): void;
  // Pause input (during agent response or editor)
  pause(): void;
  // Resume input
  resume(): void;
  // Close readline
  close(): void;
}

export function createInputController(options: {
  prompt: string;
  onShortcut: (key: string, ctrl: boolean) => boolean;  // return true if handled
}): InputController;

// Open $EDITOR with optional initial content, return edited text
export async function openEditor(initialContent?: string): Promise<string | null>;
```

Key behaviors:
- Readline with custom key handling:
  - Enter → submit current buffer
  - ctrl+j → insert newline (multi-line inline input)
  - ctrl+c → first time: warn "press again to quit"; second time within 2s: quit
  - ctrl+e → trigger `/editor` command
  - ctrl+r → trigger `/reply` command
  - Tab → command autocomplete (if input starts with `/`)
- `openEditor`:
  - Create temp file with `.md` extension
  - If `initialContent` provided, write it to the temp file
  - Spawn `$EDITOR` (fallback to `vi`) with the temp file
  - Wait for editor to exit
  - Read temp file content
  - Delete temp file
  - Return content (or null if empty/unchanged)
- For `/reply N`: query last N assistant messages from SQLite, format as quoted markdown (prefix each line with `> `), pass as initial content to `openEditor`

**Files:**
- Implement `acp-client/src/tui/input.ts`

**Acceptance criteria:**
- Inline input works: type text, press Enter to submit
- ctrl+j inserts a newline without submitting
- ctrl+c double-tap quits
- ctrl+e opens $EDITOR and returns content
- ctrl+r opens $EDITOR with quoted last assistant message
- `/reply 3` quotes the 3 most recent assistant messages
- Editor returns null if user saves empty file
- Unit tests verify key handling logic (mock readline)

---

### Step 9: Implement the TUI — output rendering

Build the output layer: streaming markdown to stdout with tool call display and approval prompts.

**`acp-client/src/tui/output.ts`:**

```typescript
export interface OutputController {
  // Stream a text chunk to stdout (appends to current message)
  writeChunk(text: string): void;
  // End the current message (add newline)
  endMessage(): void;
  // Display a tool call announcement
  showToolCall(toolCall: { toolCallId: string; title: string; kind: string; status: string }): void;
  // Update a tool call status
  updateToolCall(toolCallId: string, status: string, content?: string): void;
  // Display plan entries
  showPlan(entries: PlanEntry[]): void;
  // Display system message (e.g. mode change, compaction status)
  showSystem(message: string): void;
  // Display error
  showError(message: string): void;
  // Clear terminal
  clear(): void;
}
```

Key behaviors:
- Text chunks are written directly to stdout (no buffering — real-time streaming)
- Tool calls displayed as compact lines: `🔧 [status] tool_name — title`
- Tool call updates modify the displayed status in-place (using ANSI cursor movement)
- Plan entries displayed as a numbered list with status indicators
- System messages displayed in dim/gray
- Errors displayed in red

**`acp-client/src/tui/approval.ts`:**

```typescript
export async function promptApproval(
  toolCall: { toolCallId: string; title: string; kind: string; rawInput?: object },
  options: PermissionOption[],
): Promise<RequestPermissionResponse>;
```

Key behaviors:
- Display tool call details (name, title, input summary)
- Prompt: `Allow? [y]es / [n]o / [t]rust always >`
- Map responses: y → find option with kind `allow_once`, t → `allow_always`, n → `reject_once`
- Return the selected option ID wrapped in the ACP response format

**Files:**
- Implement `acp-client/src/tui/output.ts`
- Implement `acp-client/src/tui/approval.ts`

**Acceptance criteria:**
- Text chunks stream to stdout in real-time
- Tool calls display with status indicators
- Approval prompt accepts y/n/t and returns correct ACP response
- System messages and errors display with appropriate formatting
- Unit tests verify approval mapping logic

---

### Step 10: Implement the TUI orchestrator

Wire everything together: the main TUI loop that connects input, output, ACP connection, session management, and slash commands.

**`acp-client/src/tui/index.ts`:**

```typescript
export interface TuiOptions {
  cwd: string;
  resumeSessionId?: string;  // --resume <id>
  agentCommand?: string;     // override agent binary (default: kiro-cli-chat)
}

export async function startTui(options: TuiOptions): Promise<void>;
```

The orchestrator:
1. Initialize SQLite DB (write mode)
2. Spawn ACP connection (`core/connection.ts`)
3. Create Client handler (`core/client-handler.ts`) wired to:
   - Output controller for display
   - SQLite for persistence
   - Approval prompt for tool permissions
   - File system and terminal implementations
4. Initialize the connection (exchange capabilities)
5. Read MCP servers from kiro config (`adapters/kiro/mcp-config.ts`)
6. Create or load session:
   - If `resumeSessionId`: call `session.loadSession()`, replay history to output
   - Else: call `session.createSession(cwd, mcpServers)`
7. Register slash commands:
   - Local commands (TUI layer)
   - Kiro forwarded commands (adapter layer)
   - Agent-advertised commands (from `available_commands_update`)
8. Start input loop:
   - On input: check if slash command → dispatch; else → send as prompt
   - During prompt: pause input, stream response, resume input on turn end
   - On turn end: notify weaver server via HTTP POST `/api/notify`
9. On shutdown: cancel in-progress prompt, close connection, close DB

**`acp-client/src/index.ts`:**

```typescript
#!/usr/bin/env node
// Parse args: weaver chat [--resume <id>] [--cwd <path>]
// Call startTui(options)
```

**Files:**
- Implement `acp-client/src/tui/index.ts`
- Implement `acp-client/src/index.ts`
- Implement `acp-client/src/storage/index.ts` — thin wrapper over WeaverDb for write operations
- Implement `acp-client/src/storage/event-emitter.ts` — HTTP POST to weaver server `/api/notify`

**Acceptance criteria:**
- `weaver chat` launches, connects to kiro-cli acp, and presents a prompt
- User can type a message, see streamed response, approve tool calls
- `/editor` opens $EDITOR, `/reply` quotes last message
- Slash commands route correctly (local vs forwarded)
- Session data persists to SQLite
- `weaver chat --resume <id>` loads and replays a previous session
- ctrl+c double-tap exits cleanly
- Weaver server receives notify events (if running)
### Step 11: Wire `weaver chat` through the bash wrapper and CLI

Update the existing `bin/weaver` bash wrapper and CLI package to support the `weaver chat` subcommand.

**`bin/weaver` changes:**

Add a special case for the `chat` command that delegates to the `acp-client` package instead of the existing CLI:

```bash
# Before the existing handler:
if [ "$1" = "chat" ]; then
  shift
  ACP_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)/acp-client"
  exec npx --prefix "$ACP_DIR" tsx "$ACP_DIR/src/index.ts" "$@"
fi
```

This means `weaver chat` bypasses the existing CLI entirely and goes straight to the ACP client. The existing commands (`view`, `session`, `rename`, `toggle`) continue to work as before.

**`cli/src/index.ts` changes:**

Add `chat` to the help text so `weaver --help` shows it:

```
Commands:
  chat              Start an interactive ACP chat session
  chat --resume ID  Resume a previous session
  view              Navigate dashboard to the current kiro-cli session
  ...
```

No actual handler needed in the CLI package — the bash wrapper intercepts `chat` before it reaches the TS CLI.

**Files:**
- Modify `bin/weaver` — add `chat` command delegation
- Modify `cli/src/index.ts` — add `chat` to help text

**Acceptance criteria:**
- `weaver chat` launches the ACP client TUI
- `weaver chat --resume <id>` passes the flag through
- `weaver view`, `weaver session`, etc. continue to work unchanged
- `weaver --help` shows the `chat` command

---

### Step 12: Refactor the server to read from SQLite

Replace the server's JSONL-based storage and log-parser services with SQLite queries against `~/.weaver/weaver.sqlite3`.

**Services to replace:**

1. **`server/src/services/storage/storage.ts`** → rewrite to use `WeaverDb` (read-only mode):
   - `readSessions()` → `db.listSessions()` mapped to `Session[]`
   - `appendSession()` → removed (ACP client writes)
   - `writeSessions()` → removed (ACP client writes)
   - `isProcessRunning()` → kept (checks if PID is alive)
   - `cleanStaleSessions()` → rewritten to update `status='closed'` in SQLite for dead PIDs
   - `startPidPolling()` → kept, uses SQLite queries

2. **`server/src/services/log-parser/log-parser.ts`** → rewrite:
   - `parseLogFile()` → `db.getEvents(sessionId)` + `db.getMessages(sessionId)`
   - `groupEventsByTurn()` → rewritten to build `TurnGroup[]` from messages + tool_calls tables
   - `deriveActivity()` → rewritten to derive from latest event in SQLite
   - `getLastEvent()` → `SELECT * FROM events WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`

3. **`server/src/services/file-cache/`** → removed (SQLite handles caching via page cache)

**Route changes:**

The route handlers stay mostly the same — they call the same service functions, which now query SQLite instead of JSONL. The API contract (request/response shapes) stays identical.

Key changes:
- `GET /api/sessions` — returns `SessionWithStatus[]` built from SQLite sessions + `isProcessRunning()`
- `GET /api/sessions/:id` — returns session + turns + tool calls from SQLite. The `turns` field is now built from messages + tool_calls instead of hook events. The `TurnGroup` type may need a new optional field for assistant message content.
- `PATCH /api/sessions/:id` — updates `custom_name` in SQLite (server needs write access for this one operation, or the API proxies to a write endpoint)
- `DELETE /api/sessions/:id` — deletes session + cascade in SQLite
- `POST /api/notify` — kept as-is (triggers SSE broadcast). The server no longer needs to read JSONL on notify — it just broadcasts the event.

**Write access consideration:**

The server needs write access for exactly two operations: `PATCH /api/sessions/:id` (rename) and `DELETE /api/sessions/:id`. Options:
- Open the DB in read-write mode on the server too (simplest, WAL handles contention)
- Have the server call the ACP client to do the write (over-engineered)

Recommendation: open in read-write mode. WAL mode handles concurrent access. The server's writes are infrequent and small.

**Shared types update:**

The `TurnGroup` type in `shared/types/events.ts` gains optional fields for enriched data:
```typescript
export interface TurnGroup {
  // ... existing fields ...
  assistantContent?: string;          // full assistant message text
  toolCallDetails?: ToolCallDetail[]; // enriched tool call data from SQLite
}

export interface ToolCallDetail {
  id: string;
  toolName: string;
  kind?: string;
  status: string;
  input?: string;   // full JSON input
  output?: string;  // full JSON output
  startedAt: string;
  completedAt?: string;
}
```

**Files:**
- Rewrite `server/src/services/storage/storage.ts` — use `WeaverDb` (read-write mode)
- Rewrite `server/src/services/log-parser/log-parser.ts` — build turns from SQLite
- Delete `server/src/services/file-cache/` (no longer needed)
- Update `server/src/index.ts` — instantiate `WeaverDb`, pass to services
- Update `server/package.json` — add `@weaver/shared` dependency for db module (already exists, but ensure `better-sqlite3` is accessible)
- Update `shared/types/events.ts` — add `assistantContent`, `ToolCallDetail` to `TurnGroup`
- Update route handlers if return shapes changed

**Acceptance criteria:**
- `GET /api/sessions` returns sessions from SQLite
- `GET /api/sessions/:id` returns session detail with enriched turn data (assistant messages, full tool I/O)
- `PATCH /api/sessions/:id` updates the session name in SQLite
- `DELETE /api/sessions/:id` removes the session from SQLite
- `POST /api/notify` triggers SSE broadcast
- All existing server tests pass (rewritten to use SQLite fixtures instead of JSONL mocks)
- Dashboard loads and displays sessions correctly

---

### Step 13: Simplify the hook handler

Simplify `weaver-log.sh` to be a lightweight signal mechanism. It no longer writes JSONL event logs — the ACP client handles persistence via SQLite. The hook is retained for future validation hooks and as a fallback for non-weaver sessions (e.g., if someone uses `kiro-cli chat` directly).

**Changes to `hook-handler/weaver-log.sh`:**

The hook now:
1. On `agentSpawn`: writes a minimal `.current-session-<pid>` marker file (kept for PID tracking)
2. On all events: calls `POST /api/notify` to the weaver server (kept for SSE broadcasts)
3. No longer writes to `~/.weaver/logs/<session-id>.jsonl`

The JSONL write logic is removed. The session creation logic (reading from kiro's SQLite to get conversation_id) is removed — the ACP client handles session creation directly.

**Backward compatibility:**

If someone runs `kiro-cli chat` directly (not through `weaver chat`), the hook still fires and notifies the server. The server can detect these "hook-only" sessions (no matching session in SQLite) and display them with limited data — or ignore them. This is a graceful degradation path.

**Files:**
- Modify `hook-handler/weaver-log.sh` — remove JSONL writes, keep marker file + notify
- Update `hook-handler/weaver-log.test.sh` — update tests for simplified behavior

**Acceptance criteria:**
- Hook fires on all events and calls `/api/notify`
- No JSONL files are created
- Marker files are still created for PID tracking
- Tests pass for the simplified hook

---

### Step 14: Integration testing and cleanup

End-to-end verification that all pieces work together.

**Integration test scenarios:**

1. **New session flow**: `weaver chat` → type prompt → receive response → approve tool call → see result → `/quit`
2. **Session resume**: `weaver chat` → send prompt → `/quit` → `weaver chat --resume <id>` → see history → send another prompt
3. **Dashboard integration**: `weaver chat` → send prompt → open dashboard → see session with messages and tool calls
4. **Editor flow**: `weaver chat` → ctrl+e → type in editor → save → see response
5. **Reply flow**: `weaver chat` → send prompt → get response → `/reply` → see quoted response in editor → edit and send
6. **Slash commands**: `/model` → forwarded to agent → model changes; `/help` → shows all commands
7. **Multiple sessions**: open two terminals → `weaver chat` in each → both write to SQLite → dashboard shows both
8. **Clean shutdown**: ctrl+c twice → child process killed → session marked closed in SQLite

**Cleanup tasks:**
- Remove `server/src/services/file-cache/` directory
- Remove JSONL-related test fixtures
- Update `server/jest.config.mjs` if needed
- Verify `turbo build` and `turbo test` pass for all packages
- Verify `npm run app` (Electron) works with the refactored server

**Files:**
- Create `acp-client/src/__tests__/integration.test.ts` (or manual test script)
- Clean up deleted files
- Update any remaining imports

**Acceptance criteria:**
- All integration test scenarios pass
- `turbo build` succeeds for all packages
- `turbo test` passes for all packages
- `npm run app` launches the Electron app with working dashboard
- `npm run dev` works for browser development
## Files to Modify/Create

| Action | File | Description |
|--------|------|-------------|
| **Create** | `shared/db/types.ts` | SQLite row types (SessionRow, MessageRow, ToolCallRow, EventRow) |
| **Create** | `shared/db/schema.sql` | SQLite schema definition |
| **Create** | `shared/db/weaver-db.ts` | Database wrapper class with typed CRUD operations |
| **Create** | `shared/db/index.ts` | Package exports |
| **Modify** | `shared/package.json` | Add `better-sqlite3` dependency, add `./db` export |
| **Modify** | `shared/tsconfig.json` | Include `db/` directory |
| **Modify** | `shared/types/events.ts` | Add `assistantContent`, `ToolCallDetail` to `TurnGroup` |
| **Create** | `acp-client/package.json` | Package manifest with ACP SDK dependency |
| **Create** | `acp-client/tsconfig.json` | TypeScript config |
| **Create** | `acp-client/jest.config.mjs` | Jest config |
| **Create** | `acp-client/src/index.ts` | Entry point: parse args, start TUI |
| **Create** | `acp-client/src/core/connection.ts` | ACP connection lifecycle (spawn, initialize, shutdown) |
| **Create** | `acp-client/src/core/session.ts` | Session management (new, load, prompt, cancel) |
| **Create** | `acp-client/src/core/client-handler.ts` | ACP Client interface implementation |
| **Create** | `acp-client/src/core/types.ts` | Internal types |
| **Create** | `acp-client/src/adapters/kiro/index.ts` | KiroAdapter class |
| **Create** | `acp-client/src/adapters/kiro/extensions.ts` | `_kiro.dev/*` extension handlers |
| **Create** | `acp-client/src/adapters/kiro/mcp-config.ts` | Read kiro MCP config files |
| **Create** | `acp-client/src/adapters/kiro/commands.ts` | Kiro-specific forwarded slash commands |
| **Create** | `acp-client/src/tui/index.ts` | TUI orchestrator |
| **Create** | `acp-client/src/tui/input.ts` | Readline + $EDITOR integration |
| **Create** | `acp-client/src/tui/output.ts` | Streaming markdown output |
| **Create** | `acp-client/src/tui/commands.ts` | Slash command registry and routing |
| **Create** | `acp-client/src/tui/approval.ts` | Tool approval prompt (y/n/t) |
| **Create** | `acp-client/src/storage/index.ts` | SQLite write operations wrapper |
| **Create** | `acp-client/src/storage/event-emitter.ts` | HTTP notify to weaver server |
| **Modify** | `bin/weaver` | Add `chat` command delegation to acp-client |
| **Modify** | `cli/src/index.ts` | Add `chat` to help text |
| **Rewrite** | `server/src/services/storage/storage.ts` | Use WeaverDb instead of JSONL |
| **Rewrite** | `server/src/services/log-parser/log-parser.ts` | Build turns from SQLite instead of JSONL |
| **Delete** | `server/src/services/file-cache/` | No longer needed (SQLite handles caching) |
| **Modify** | `server/src/index.ts` | Instantiate WeaverDb, pass to services |
| **Modify** | `server/package.json` | Ensure `better-sqlite3` accessible via shared |
| **Modify** | `server/src/routes/sessions/sessions.ts` | Adjust for new service signatures if needed |
| **Modify** | `server/src/routes/events/events.ts` | Adjust for new service signatures if needed |
| **Modify** | `hook-handler/weaver-log.sh` | Remove JSONL writes, keep marker + notify |
| **Modify** | `hook-handler/weaver-log.test.sh` | Update tests for simplified hook |
| **Modify** | `package.json` (root) | Add `acp-client` to workspaces |
| **Rewrite** | `server/src/services/storage/storage.test.ts` | Use SQLite fixtures instead of JSONL mocks |
| **Rewrite** | `server/src/services/log-parser/log-parser.test.ts` | Use SQLite fixtures |
| **Rewrite** | `server/src/routes/sessions/sessions.test.ts` | Use SQLite fixtures |
| **Rewrite** | `server/src/routes/events/events.test.ts` | Use SQLite fixtures |
## Testing Strategy

### Unit Tests — shared/db

- `shared/db/weaver-db.test.ts` — test all CRUD operations using in-memory SQLite (`:memory:`). Verify schema creation, session lifecycle, message ordering, tool call upserts, event appending, cascade deletes, WAL mode enabled.

### Unit Tests — acp-client/core

- `acp-client/src/core/connection.test.ts` — mock `child_process.spawn` and `ndJsonStream`. Verify initialize handshake, capability exchange, clean shutdown, orphan process cleanup.
- `acp-client/src/core/session.test.ts` — mock `ClientSideConnection`. Verify session creation stores to SQLite, session load replays messages, prompt sends and resolves on turn end, cancel sends notification.
- `acp-client/src/core/client-handler.test.ts` — verify `sessionUpdate` dispatch: each update type calls the correct callback. Verify `requestPermission` maps y/n/t to correct ACP options. Verify fs and terminal methods execute and log to SQLite.

### Unit Tests — acp-client/adapters/kiro

- `acp-client/src/adapters/kiro/mcp-config.test.ts` — test MCP config reading: global only, workspace only, merge (workspace overrides), missing files, malformed JSON.
- `acp-client/src/adapters/kiro/commands.test.ts` — verify forwarded commands are registered and dispatch to `executeCommand`.
- `acp-client/src/adapters/kiro/extensions.test.ts` — verify each `_kiro.dev/*` notification is handled correctly.

### Unit Tests — acp-client/tui

- `acp-client/src/tui/commands.test.ts` — verify command registration, lookup by name, lookup by shortcut, `handleInput` dispatch, `/help` output.
- `acp-client/src/tui/input.test.ts` — mock readline. Verify enter submits, ctrl+j inserts newline, ctrl+c double-tap quits, editor integration returns content.
- `acp-client/src/tui/approval.test.ts` — verify y/n/t mapping to ACP permission options.

### Unit Tests — server (rewritten)

- `server/src/services/storage/storage.test.ts` — rewritten to use in-memory SQLite. Verify `readSessions`, `isProcessRunning`, `cleanStaleSessions`, PID polling.
- `server/src/services/log-parser/log-parser.test.ts` — rewritten to build turns from SQLite data. Verify `groupEventsByTurn` produces correct `TurnGroup[]` from messages + tool_calls.
- `server/src/routes/sessions/sessions.test.ts` — rewritten with SQLite fixtures. Verify all session endpoints.
- `server/src/routes/events/events.test.ts` — verify notify + SSE broadcast still works.

### Integration Tests

- Manual test script or lightweight integration test that:
  1. Spawns `weaver chat` with a mock agent (simple echo agent)
  2. Sends a prompt, verifies response appears
  3. Verifies session appears in SQLite
  4. Verifies `GET /api/sessions` returns the session
  5. Verifies `GET /api/sessions/:id` returns messages and tool calls

### Manual Testing Checklist

1. `weaver chat` → type prompt → see streamed response
2. Tool call → approve with `y` → see result
3. Tool call → reject with `n` → see rejection
4. Tool call → trust with `t` → subsequent calls auto-approved
5. `/editor` → type in editor → save → see response
6. `/reply` → see quoted message → edit → send
7. `/reply 3` → see 3 quoted messages
8. ctrl+e → editor opens
9. ctrl+r → reply editor opens
10. ctrl+c → warning → ctrl+c again → quit
11. `/model` → forwarded to agent → model changes
12. `/compact` → forwarded → compaction status displayed
13. `/help` → all commands listed
14. `/clear` → terminal cleared + agent context cleared
15. `weaver chat --resume <id>` → history replayed → continue conversation
16. Open dashboard → see session with full messages and tool calls
17. Two terminals → two `weaver chat` sessions → both visible in dashboard
18. Kill terminal → session marked closed in dashboard

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| `kiro-cli acp` binary name changes | Connection fails | Agent command is configurable; default detected at runtime by checking both `kiro-cli` and `kiro-cli-chat` |
| `_kiro.dev/*` extensions change | Kiro adapter breaks | Extensions are isolated in the kiro adapter; core ACP client unaffected. Version check on initialize. |
| SQLite write contention with multiple ACP clients | Slow writes or SQLITE_BUSY errors | WAL mode + busy timeout (5s). Writes are small and fast (single row inserts). |
| `better-sqlite3` native module in Electron | Server fails in packaged app | Server already runs as forked child process. Add `electron-rebuild` to desktop build. Pin `better-sqlite3` version. |
| `$EDITOR` not set or editor crashes | Input lost | Fallback to `vi`. Write to temp file before opening editor. If editor exits non-zero, keep temp file and show path. |
| Agent process orphaned on crash | Zombie processes | Process group cleanup. PID file tracking. Server's stale session cleanup detects and marks closed. |
| Dashboard breaks during server refactor | Regression | API contract stays the same. Run existing e2e tests after refactor. Add new fields as optional (backward compatible). |
| Session load replays large history | Slow startup, high memory | Stream replay to output without buffering full history. Paginate SQLite writes. |

## Dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| `@agentclientprotocol/sdk` | npm | ACP client connection, types, ndJsonStream |
| `better-sqlite3` | npm (native) | SQLite database access |
| `@types/better-sqlite3` | npm (dev) | TypeScript types for better-sqlite3 |
| `kiro-cli` | system | ACP agent (spawned as child process) |
| `electron-rebuild` | npm (dev) | Rebuild native modules for Electron packaging |

No infrastructure changes. No external API changes. No new cloud dependencies.
