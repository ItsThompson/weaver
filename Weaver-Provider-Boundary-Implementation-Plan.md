# Weaver Provider Boundary — Implementation Plan v2

## Overview

Introduce a `ConversationProvider` interface that decouples the Weaver server from kiro-cli internals. Create `@weaver/provider-kiro` as the first implementation, wrapping existing hook-based session tracking and adding direct SQLite reads for full conversation content (assistant messages, complete tool I/O, tangent state).

This is the foundation for the future Weaver ACP client — when that ships, it replaces `@weaver/provider-kiro` with an ACP-based provider and the server doesn't change.

### Success criteria

- Server imports zero kiro-specific types or services directly
- Existing API endpoints return identical responses (no client breakage)
- Session detail endpoint returns full conversation content (assistant messages, tool calls with complete input/output)
- Tangent state is surfaced when active
- Hook-based real-time activity tracking continues to work
- `weaver-log.sh` uses kiro's `conversation_id` as the session ID when unambiguous; provider resolves lazily for subagent cases
- Session list shows enriched metadata (model, context %, turn count, credit cost, branch indicator)
- Session detail page renders assistant responses and complete tool I/O inline

### Assumptions

- `sqlite3` CLI is available on macOS (pre-installed)
- kiro-cli writes the `conversations_v2` row before the `agentSpawn` hook fires
- The kiro SQLite DB path is `~/Library/Application Support/kiro-cli/data.sqlite3` (macOS only for now)
- Cherrypick flow stays client-side and continues importing kiro-specific types from `@weaver/shared` (deferred refactor)
- No new npm dependencies beyond `better-sqlite3` for the kiro provider
- `HookEvent` and `HookEventData` remain in `@weaver/shared` until the ACP client work begins (TurnGroup depends on them)

---

## Approach

### Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  weaver-cli  │────▶│    weaver-server      │     │  weaver-client   │
│  (hooks)     │     │                      │◀───▶│  (dashboard)     │
└─────────────┘     │  ConversationProvider │     └──────────────────┘
                    │  (interface)          │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  @weaver/provider-kiro │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │ Hook data        │  │  ~/.weaver/ (sessions, events, activity)
                    │  │ (existing)       │  │
                    │  ├─────────────────┤  │
                    │  │ SQLite reader    │  │  ~/Library/Application Support/kiro-cli/data.sqlite3
                    │  │ (new)            │  │
                    │  └─────────────────┘  │
                    └───────────────────────┘
```

### Key decisions

1. **Weaver-native types** — the provider interface uses Weaver's own types, not ACP or kiro types. The kiro provider maps internally.
2. **Session ID = kiro conversation_id (when unambiguous)** — the hook script reads the conversation_id from kiro's SQLite at agentSpawn time when exactly one recent conversation exists for the CWD. For subagent bursts (multiple recent conversations), falls back to uuidgen and the provider resolves the mapping lazily via prompt matching. The `Session` type gains an optional `conversationId` field for this deferred resolution.
3. **Read-only for now** — the interface is designed to be extensible for bidirectional operations (sendPrompt, cancelTurn) but this phase only implements read/observe.
4. **Branching as a first-class concept** — tangent/branch state is part of the generic provider interface (optional), not kiro-specific. This sets up the git-like branching model for the future ACP client.
5. **Server fully decoupled** — server imports only from `@weaver/shared` and the provider interface. All kiro-specific logic lives in `@weaver/provider-kiro`.
6. **Hook types stay in shared** — `HookEvent` and `HookEventData` remain in `@weaver/shared/types` because `TurnGroup` depends on them and the client imports `TurnGroup`. These types will be refactored when the ACP client work begins.
7. **better-sqlite3 over sql.js** — sql.js loads the entire database into memory as a Uint8Array. The kiro DB is ~325MB; loading it all into RAM for a single row read is unacceptable. better-sqlite3 uses native SQLite page-level reads, only loading what's needed. The Electron packaging concern is addressed: the server runs as a forked child process (`fork()` in desktop/src/server.ts), so `better-sqlite3` needs to be compiled against Electron's bundled Node version. This is handled by adding `electron-rebuild` to the desktop build pipeline.
8. **Credit cost from `user_turn_metadata.usage_info`** — kiro stores per-request credit costs in `user_turn_metadata.usage_info` (array of `{value, unit, unit_plural}`). However, `user_turn_metadata` is overwritten on each user turn — it only contains data for the most recent turn, not the full conversation. Strategy: (a) accumulate a running total in weaver's session metadata on each `notify` event, and (b) show the latest turn's cost breakdown in the detail view. Historical sessions (pre-change) show "—".

### Conversation ID resolution (subagent-safe)

Each kiro-cli agent (including subagents) gets its own `conversation_id` in the DB. When multiple agents spawn in parallel in the same CWD, we need to assign each weaver session to the correct conversation. This is solved with a two-tier approach that's fully abstracted behind the provider — consumers call `getSessionDetail` and get conversation content without knowing any of this exists.

**Tier 1 — Hook fast path (single agent, ~95% of cases):**

At `agentSpawn`, count conversations for this CWD created in the last 10 seconds. If exactly 1 → use its `conversation_id` as the session ID. If 0 or >1 → fall back to `uuidgen`. This handles the common single-agent case with zero ambiguity.

**Tier 2 — Provider conversation resolver (subagent case):**

When `handleNotify` is called for a session whose ID is a uuidgen (not found in `conversations_v2`), the provider runs a resolution process:

1. **Attempt direct assignment**: Query all conversations for this CWD created within ±30s of the session start time. For each candidate, check if it's already assigned to another weaver session (by scanning `sessions.jsonl` for matching `conversationId` values). If exactly one unassigned conversation exists → assign it to this session.

2. **Conflict detection**: If the assigned conversation is later claimed by another session (because the hook fast path gave two sessions the same conversation_id), the provider detects the conflict on the next `handleNotify`, de-assigns the conversation from the current session, and moves the session's events to orphan. Then re-enters resolution.

3. **Prompt matching**: When multiple unassigned conversations exist (subagent case), compare the first `userPromptSubmit` prompt from the session's hook log against each candidate's `history[0].user.content.Prompt.prompt`. If exactly one match → assign it.

4. **Progressive disambiguation**: If prompts are identical (rare — parent would need to send the exact same task to multiple subagents), wait for more data. On each subsequent `handleNotify`, compare additional messages/tool calls between the hook log and conversation history until a unique match is found. Events remain in orphan until resolved.

5. **Permanent fallback**: If disambiguation never succeeds, the session stays in hook-only view. No data is lost — orphan events can be manually assigned via the dashboard.

**Data model**: `Session` gains an optional `conversationId?: string` field. The provider uses `session.conversationId ?? session.id` when querying SQLite. This field is set by the hook fast path (when `id` IS the conversation_id) or by the resolver (when `id` is a uuidgen).

**Abstraction**: All of this is internal to `KiroProvider`. The `ConversationProvider` interface is unchanged — `getSessionDetail` returns `conversation: ConversationDetail | null`, and consumers never see the resolution machinery. A `null` conversation simply means "not yet resolved" or "no conversation data available."

---

## Implementation Steps

### Step 1: Define the provider interface in `shared/`

Create `shared/provider.ts` with the generic `ConversationProvider` interface and Weaver-native conversation content types.

**Types to define:**

```typescript
// Discriminated union for conversation messages
type ConversationMessage = UserPromptMessage | UserToolResultMessage | AssistantTextMessage | AssistantToolUseMessage;

interface UserPromptMessage {
  role: 'user';
  type: 'prompt';
  content: string;
  timestamp: string;
}

interface UserToolResultMessage {
  role: 'user';
  type: 'tool_result';
  toolResults: ConversationToolResult[];
  timestamp: string;
}

interface AssistantTextMessage {
  role: 'assistant';
  type: 'text';
  content: string;
  timestamp: string;
}

interface AssistantToolUseMessage {
  role: 'assistant';
  type: 'tool_use';
  content: string;
  toolCalls: ConversationToolCall[];
  timestamp: string;
}

interface ConversationToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ConversationToolResult {
  toolCallId: string;
  content: unknown;
  status: 'success' | 'error';
}

interface BranchState {
  startTime: string;
  mainTurnCount: number;
}

interface ConversationDetail {
  id: string;
  messages: ConversationMessage[];
  branch: BranchState | null;
  model?: string;
  contextUsagePercent?: number;
  turnCount?: number;
  creditCost?: number;           // running total accumulated on each notify
  lastTurnCreditCost?: number;   // cost of the most recent user turn only
}

// Lightweight summary for session list views (avoids parsing full conversation)
interface SessionSummary {
  model?: string;
  contextUsagePercent?: number;
  turnCount?: number;
  creditCost?: number;           // running total accumulated on each notify
  isBranching?: boolean;
}

// The provider interface
interface ConversationProvider {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;

  // Sessions
  listSessions(): Promise<(SessionWithStatus & { summary?: SessionSummary })[]>;
  getSessionDetail(sessionId: string): Promise<{
    session: SessionWithStatus;
    turns: TurnGroup[];
    conversation: ConversationDetail | null;
  } | null>;
  updateSession(sessionId: string, updates: { customName: string }): Promise<Session | null>;
  deleteSession(sessionId: string): Promise<boolean>;

  // Real-time
  handleNotify(sessionId: string, eventName?: string): Promise<{ sessionName: string }>;
  findSessionByPid(pid: number): Promise<Session | null>;

  // Operational
  hasActiveSessions(): Promise<boolean>;

  // Orphans (provider-specific — not all providers will have orphans)
  getOrphans?(): Promise<OrphanGroup[]>;
  getOrphanCount?(): Promise<number>;
  assignOrphans?(targetSessionId: string, pid: number): Promise<boolean>;
  deleteOrphans?(pid: number): Promise<boolean>;
}
```

**Export from shared:**

Update `shared/package.json` exports to include `./provider`:
```json
{
  "exports": {
    "./types": { "types": "./dist/types.d.ts", "default": "./dist/types.js" },
    "./provider": { "types": "./dist/provider.d.ts", "default": "./dist/provider.js" }
  }
}
```

**Files:**
- Create `shared/provider.ts`
- Update `shared/package.json`
- Update `shared/tsconfig.json` (include new file)

---

### Step 2: Create the `@weaver/provider-kiro` package

Scaffold the package and move existing kiro-specific server logic into it.

**Package structure:**
```
providers/
  kiro/
    package.json
    tsconfig.json
    src/
      index.ts              # exports KiroProvider class
      hook-reader.ts        # existing: readSessions, parseLogFile, groupEventsByTurn, etc.
      db-reader.ts          # new: SQLite conversation reader
      conversation-resolver.ts  # new: Tier 2 conversation ID resolution
      pid-tracker.ts        # existing: isProcessRunning, stale cleanup, PID polling
```

**What moves from server → provider-kiro:**
- `server/src/services/storage.ts` → `providers/kiro/src/hook-reader.ts` + `providers/kiro/src/pid-tracker.ts`
- `server/src/services/log-parser.ts` → `providers/kiro/src/hook-reader.ts`

**Note:** `HookEventData` and `HookEvent` stay in `@weaver/shared/types` — they are not moved. `TurnGroup` depends on them and the client imports `TurnGroup`. These will be refactored when the ACP client work begins.

**package.json:**
```json
{
  "name": "@weaver/provider-kiro",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "dependencies": {
    "@weaver/shared": "*",
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.15.3",
    "typescript": "^5.8.3"
  }
}
```

**Register in root `package.json` workspaces:**
```json
"workspaces": ["shared", "providers/kiro", "server", "client", "cli", "hook-handler", "desktop"]
```

**Verify turbo.json:** The new `providers/kiro` package will be auto-discovered by turbo via the workspace config. Verify that `turbo build` includes it in the dependency graph and that its `build` task runs before `server`'s build (since server depends on it via `@weaver/provider-kiro`).

**Files:**
- Create `providers/kiro/package.json`
- Create `providers/kiro/tsconfig.json`
- Create `providers/kiro/src/hook-reader.ts` — move from `server/src/services/log-parser.ts` + read parts of `storage.ts`
- Create `providers/kiro/src/pid-tracker.ts` — move from `server/src/services/storage.ts` (isProcessRunning, stale cleanup, PID polling)
- Create `providers/kiro/src/index.ts` — `KiroProvider` class implementing `ConversationProvider`
- Update root `package.json` workspaces
- Verify `turbo.json` picks up the new package correctly

---

### Step 3: Implement the SQLite reader

New module in the kiro provider that reads conversation content from kiro's SQLite database.

**`providers/kiro/src/db-reader.ts`:**

```typescript
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const DB_PATH = () => join(homedir(), 'Library', 'Application Support', 'kiro-cli', 'data.sqlite3');

// Read-only connection, opened lazily
// Query conversation by ID (which is now our session ID)
// Parse the JSON value column
// Map kiro's history turns → Weaver's ConversationMessage[] (discriminated union)
// Extract tangent_state → BranchState
// Extract model_info → model name
// Extract latest context_usage_percentage from request_metadata
// Read user_turn_metadata.usage_info → latest turn credit costs
```

**Key mapping logic:**
- kiro `Prompt` → `UserPromptMessage { role: 'user', type: 'prompt', content }`
- kiro `Response` → `AssistantTextMessage { role: 'assistant', type: 'text', content }`
- kiro `ToolUse` → `AssistantToolUseMessage { role: 'assistant', type: 'tool_use', content, toolCalls }`
- kiro `ToolUseResults` → `UserToolResultMessage { role: 'user', type: 'tool_result', toolResults }`
- kiro `tangent_state` → `BranchState { startTime, mainTurnCount: main_history.length }`

**Credit cost tracking:**

kiro stores per-request credit costs in `user_turn_metadata.usage_info`:
```json
[{"value": 0.42, "unit": "credit", "unit_plural": "credits"},
 {"value": 0.66, "unit": "credit", "unit_plural": "credits"}]
```

This field is overwritten on each user turn — it only contains costs for the most recent turn's API requests, not the full conversation.

Strategy:
- **Running total (session list)**: On each `handleNotify` call, read `usage_info`, sum the values, and add to a running `creditCost` total stored in weaver's own session metadata (`sessions.jsonl` or a separate accumulator). This gives accurate totals for sessions created after the change.
- **Latest turn cost (detail view)**: Read `usage_info` directly from SQLite and sum it → `lastTurnCreditCost`. This is always current.
- **Historical sessions**: Sessions created before this change have no accumulated cost data — show "—".

**Considerations:**
- Open the database in read-only mode (`{ readonly: true }`)
- Handle the case where the DB doesn't exist (kiro not installed)
- Handle the case where the conversation_id isn't found (session predates this change)
- Cache the parsed conversation per session, invalidate on notify

**Files:**
- Create `providers/kiro/src/db-reader.ts`

---

### Step 4: Wire up the `KiroProvider` class

Implement `ConversationProvider` in `providers/kiro/src/index.ts`, composing the hook reader, SQLite reader, and PID tracker.

```typescript
export class KiroProvider implements ConversationProvider {
  // Composes:
  // - hook-reader (sessions, events, turns)
  // - db-reader (conversation content)
  // - conversation-resolver (Tier 2 conversation ID resolution)
  // - pid-tracker (process liveness, stale cleanup)

  async start() {
    // Start stale session cleanup interval
    // Start PID polling (calls onSessionClosed callback)
  }

  async stop() {
    // Clear intervals
    // Close SQLite connection if open
  }

  async listSessions() {
    // readSessions() + enrich with status/activity + SessionSummary from SQLite
    // Uses session.conversationId ?? session.id to look up conversation data
  }

  async getSessionDetail(sessionId: string) {
    // Hook data: session + turns (existing)
    // SQLite data: conversation content via resolvedConversationId (new)
    // Merge and return — consumer sees conversation: ConversationDetail | null
    // null means "not yet resolved" or "no data" — consumer doesn't know why
  }

  async updateSession(sessionId, updates) { /* read/write sessions.jsonl */ }
  async deleteSession(sessionId) { /* remove log file, session marker, sessions.jsonl entry */ }

  async handleNotify(sessionId, eventName?) {
    // 1. Find session name for notification
    // 2. Invalidate conversation cache
    // 3. Accumulate credit cost from usage_info
    // 4. Run conversation resolver if session has no conversationId yet:
    //    - Try direct assignment (unassigned conversation for this CWD)
    //    - Detect conflicts (another session claimed same conversation_id)
    //    - Prompt matching if multiple candidates
    //    - Progressive disambiguation if prompts identical
  }

  async findSessionByPid(pid) { /* scan sessions for matching PID */ }
  async hasActiveSessions() { /* check open sessions for active activity status */ }

  // Orphan methods
  async getOrphans() { /* read orphan.jsonl, group by PID */ }
  async getOrphanCount() { /* count orphan events */ }
  async assignOrphans(targetSessionId, pid) { /* move events from orphan.jsonl to session log */ }
  async deleteOrphans(pid) { /* remove events from orphan.jsonl */ }
}
```

**`providers/kiro/src/conversation-resolver.ts`:**

Encapsulates the Tier 2 resolution logic. Called by `KiroProvider.handleNotify` for sessions without a resolved `conversationId`.

```typescript
// Inputs: session metadata (CWD, startTime, id), hook events, list of all sessions
// Output: resolved conversationId or null

// 1. Query conversations_v2 for this CWD within ±30s of session start
// 2. Filter out conversations already assigned to other sessions
// 3. If exactly 1 unassigned → return it
// 4. If >1 unassigned → match by prompt (first userPromptSubmit vs history[0])
// 5. If prompt match is ambiguous → compare subsequent messages progressively
// 6. If still ambiguous → return null (try again on next notify)

// Conflict detection:
// If session.conversationId is set but another session also claims it,
// de-assign from this session, move events to orphan, re-enter resolution
```

**Files:**
- Create `providers/kiro/src/index.ts`
- Create `providers/kiro/src/conversation-resolver.ts`

---

### Step 5: Refactor the server to use the provider interface

Replace all direct imports of kiro-specific services with calls through the provider.

**`server/src/index.ts`:**
```typescript
import { KiroProvider } from '@weaver/provider-kiro';

const provider = new KiroProvider();
await provider.start();

// Pass provider to route registration
registerSessionRoutes(server, provider);
registerEventRoutes(server, provider);
registerOrphanRoutes(server, provider);

// Pass provider to keep-awake
startKeepAwake(provider);

// Shutdown
const shutdown = async () => {
  stopKeepAwake();
  await provider.stop();
  await server.close();
  process.exit(0);
};
```

**Route changes — sessions.ts:**

Each route changes from direct service imports to provider calls:

```typescript
import type { ConversationProvider } from '@weaver/shared/provider';

export function registerSessionRoutes(server: FastifyInstance, provider: ConversationProvider): void {
  // GET /api/sessions
  server.get('/api/sessions', async () => provider.listSessions());

  // GET /api/sessions/:id
  server.get('/api/sessions/:id', async (req, reply) => {
    const result = await provider.getSessionDetail(req.params.id);
    if (!result) return reply.status(404).send({ error: 'Session not found' });
    return result;
  });

  // PATCH /api/sessions/:id
  server.patch('/api/sessions/:id', async (req, reply) => {
    const { customName } = req.body ?? {};
    if (typeof customName !== 'string') return reply.status(400).send({ error: 'customName must be a string' });
    const result = await provider.updateSession(req.params.id, { customName });
    if (!result) return reply.status(404).send({ error: 'Session not found' });
    return result;
  });

  // POST /api/rename — find by PID, then update
  server.post('/api/rename', async (req, reply) => {
    const { pid, customName } = req.body ?? {};
    if (typeof pid !== 'number') return reply.status(400).send({ error: 'pid required' });
    if (typeof customName !== 'string') return reply.status(400).send({ error: 'customName required' });
    const session = await provider.findSessionByPid(pid);
    if (!session) return reply.status(404).send({ error: 'No session found for PID' });
    const updated = await provider.updateSession(session.id, { customName });
    if (updated) broadcast(session.id);
    return updated;
  });

  // DELETE /api/sessions/:id
  server.delete('/api/sessions/:id', async (req, reply) => {
    const deleted = await provider.deleteSession(req.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Session not found' });
    broadcast(req.params.id);
    return { ok: true };
  });
}
```

**Route changes — events.ts:**

```typescript
export function registerEventRoutes(server: FastifyInstance, provider: ConversationProvider): void {
  // POST /api/notify
  server.post('/api/notify', async (req, reply) => {
    const { sessionId, eventName } = req.body ?? {};
    if (typeof sessionId !== 'string') return reply.status(400).send({ error: 'sessionId required' });
    const { sessionName } = await provider.handleNotify(sessionId, eventName);
    broadcast(sessionId, eventName, sessionName);
    return { ok: true };
  });

  // POST /api/view — find session by PID, emit navigate event
  server.post('/api/view', async (req, reply) => {
    const { pid } = req.body ?? {};
    if (typeof pid !== 'number') return reply.status(400).send({ error: 'pid required' });
    const session = await provider.findSessionByPid(pid);
    if (!session) return reply.status(404).send({ error: 'No session found for PID' });
    emit({ event: 'navigate', data: { sessionId: session.id } });
    return { ok: true, sessionId: session.id };
  });

  // POST /api/navigate — unchanged (no provider needed)
  // GET /api/events — unchanged (SSE, no provider needed)
}
```

**Route changes — orphans.ts:**

```typescript
export function registerOrphanRoutes(server: FastifyInstance, provider: ConversationProvider): void {
  server.get('/api/orphans', async () => {
    const groups = await provider.getOrphans?.() ?? [];
    return { groups };
  });

  server.get('/api/orphans/count', async () => {
    const count = await provider.getOrphanCount?.() ?? 0;
    return { count };
  });

  // POST /api/orphans/assign and DELETE /api/orphans/:pid
  // delegate to provider.assignOrphans() and provider.deleteOrphans()
}
```

**keep-awake.ts refactoring:**

```typescript
import type { ConversationProvider } from '@weaver/shared/provider';

let interval: ReturnType<typeof setInterval> | null = null;

export function startKeepAwake(provider: ConversationProvider): void {
  const poll = async () => {
    if (await provider.hasActiveSessions()) {
      // execute keep-awake script
    }
  };
  poll();
  interval = setInterval(poll, 60_000);
}

export function stopKeepAwake(): void {
  if (interval) { clearInterval(interval); interval = null; }
}
```

**Files to modify:**
- `server/src/index.ts` — instantiate provider, pass to routes and keep-awake
- `server/src/routes/sessions.ts` — use provider methods (including `POST /api/rename` via `findSessionByPid` + `updateSession`)
- `server/src/routes/events.ts` — use provider methods (including `POST /api/view` via `findSessionByPid`)
- `server/src/routes/orphans.ts` — use provider methods
- `server/src/services/keep-awake.ts` — accept provider, call `hasActiveSessions()`
- Delete `server/src/services/storage.ts` (moved to provider)
- Delete `server/src/services/log-parser.ts` (moved to provider)

**API response changes:**
- `GET /api/sessions` now includes optional `summary: SessionSummary` on each session
- `GET /api/sessions/:id` now includes `conversation: ConversationDetail | null` alongside existing `session` and `turns`
- All other endpoints return identical responses

---

### Step 6: Update `weaver-log.sh` to use kiro's conversation_id

Replace the `uuidgen` call with a count-checked SQLite query on `agentSpawn` (Tier 1 fast path).

**Change in `hook-handler/weaver-log.sh`:**

```bash
if [ "$HOOK_EVENT_NAME" = "agentSpawn" ]; then
  KIRO_DB="$HOME/Library/Application Support/kiro-cli/data.sqlite3"
  SESSION_ID=""

  if [ -f "$KIRO_DB" ]; then
    # Count conversations for this CWD created in the last 10 seconds.
    # If exactly 1, it's unambiguously ours (single agent, common case).
    # If 0 or >1 (subagent burst), fall back to uuidgen — the provider
    # resolver will assign the correct conversation later.
    RECENT_COUNT=$(printf '%s' "$CWD" | sqlite3 "$KIRO_DB" \
      "SELECT COUNT(*) FROM conversations_v2
       WHERE key = readfile('/dev/stdin')
       AND created_at > (strftime('%s','now') * 1000 - 10000)" 2>/dev/null)

    if [ "$RECENT_COUNT" = "1" ]; then
      SESSION_ID=$(printf '%s' "$CWD" | sqlite3 "$KIRO_DB" \
        "SELECT conversation_id FROM conversations_v2
         WHERE key = readfile('/dev/stdin')
         AND created_at > (strftime('%s','now') * 1000 - 10000)" 2>/dev/null)
    fi
  fi

  # Fallback to uuidgen if no unambiguous match or DB unavailable
  if [ -z "$SESSION_ID" ]; then
    SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  fi

  echo "$SESSION_ID" > "$SESSION_FILE"
  # ... rest of agentSpawn handling
```

**Files:**
- Modify `hook-handler/weaver-log.sh`
- Update `hook-handler/weaver-log.test.sh` — test single-conversation fast path, test multi-conversation fallback to uuidgen, test DB-missing fallback

---

### Step 7: Update `shared/types.ts`

`HookEventData` and `HookEvent` stay in `shared/types.ts` — they are NOT removed. `TurnGroup` depends on them and the client imports `TurnGroup`. These types will be refactored when the ACP client work begins.

Add optional `conversationId` to the `Session` type:
```typescript
export interface Session {
  id: string;                    // weaver session ID (conversation_id from fast path, or uuidgen)
  conversationId?: string;       // resolved kiro conversation_id (set by resolver when id is uuidgen)
  pid: number;
  customName: string | null;
  cwd: string;
  agentName: string | null;
  startTime: string;
  lastEventTime: string;
}
```

The provider uses `session.conversationId ?? session.id` internally when querying SQLite. This field is never exposed through the `ConversationProvider` interface — consumers just see `conversation: ConversationDetail | null` in the response.

Re-export the provider interface types so the server and client can import them.

**Files:**
- Verify `shared/types.ts` is unchanged (no removals)
- Verify client still compiles

---

### Step 8: Enrich the session list

Add new columns to the sessions table using the `SessionSummary` data returned by `listSessions`.

**`client/src/utils/api.ts`:**

Update `getSessions` return type to include `summary`:
```typescript
export const getSessions = () =>
  apiFetch<(SessionWithStatus & { summary?: SessionSummary })[]>('/sessions');
```

**`client/src/pages/SessionsPage/constants.ts`:**

Add new column definitions:

| Column | Source | Display |
|--------|--------|---------|
| Model | `summary.model` | Short model name (e.g. "opus-4.6") |
| Context | `summary.contextUsagePercent` | Progress bar or percentage |
| Turns | `summary.turnCount` | Numeric |
| Cost | `summary.creditCost` | Formatted credits (e.g. "1.24 cr"). Shows "—" for pre-change sessions |
| Branch | `summary.isBranching` | Badge indicator when active |

These columns are optional — cells render "—" when `summary` is null (sessions predating the change).

**Files:**
- Modify `client/src/utils/api.ts` — update types
- Modify `client/src/pages/SessionsPage/constants.ts` — add column definitions
- Modify `client/src/pages/SessionsPage/SessionsPage.tsx` — include new columns in both open/closed tabs

---

### Step 9: Render conversation content in session detail

Replace the "Assistant responses are not available" placeholder with actual conversation content.

**`client/src/utils/api.ts`:**

Update `getSession` return type:
```typescript
export const getSession = (id: string) =>
  apiFetch<{
    session: SessionWithStatus;
    turns: TurnGroup[];
    conversation: ConversationDetail | null;
  }>(`/sessions/${id}`);
```

**`client/src/pages/SessionDetailPage/SessionDetailPage.tsx`:**

- Remove the "Assistant responses are not available" notice
- Pass `conversation` data to `TurnContainer`
- When `conversation` is available, match conversation messages to turns by index/timestamp and pass the assistant response + complete tool I/O
- When `conversation` is null, fall back to current hook-only view (graceful degradation)
- Show a branch banner at the top when `conversation.branch` is not null
- Show session metadata (model, context %, credit cost) in the header description
- Show latest turn credit cost in the turn detail when available

**`client/src/pages/SessionDetailPage/components/TurnContainer.tsx`:**

Extend props to accept optional conversation data:
```typescript
interface TurnContainerProps {
  turn: TurnGroup;
  showTools: boolean;
  onToggleTools?: () => void;
  assistantMessage?: AssistantTextMessage | AssistantToolUseMessage;
}
```

When `assistantMessage` is provided:
- Render the assistant's text response in a styled block below the user prompt
- Render markdown content (the responses are markdown)

When `assistantMessage.type === 'tool_use'`:
- Use the complete tool input/output from SQLite instead of the truncated hook data
- The `ToolCallCard` already handles JSON rendering — just pass it richer data

**Files:**
- Modify `client/src/utils/api.ts` — update return type
- Modify `client/src/pages/SessionDetailPage/SessionDetailPage.tsx` — consume conversation data, add branch banner, add metadata to header
- Modify `client/src/pages/SessionDetailPage/components/TurnContainer.tsx` — render assistant responses and complete tool I/O
- Modify `client/src/components/ToolCallCard/ToolCallCard.tsx` — handle enriched tool data (if needed)

---

## Files to Modify/Create

| Action | File | Description |
|--------|------|-------------|
| Create | `shared/provider.ts` | Generic `ConversationProvider` interface + conversation content types (discriminated union) |
| Modify | `shared/package.json` | Add `./provider` export |
| Verify | `shared/types.ts` | No changes — `HookEvent`, `HookEventData` stay (TurnGroup depends on them) |
| Create | `providers/kiro/package.json` | Package manifest with `better-sqlite3` dependency |
| Create | `providers/kiro/tsconfig.json` | TypeScript config |
| Create | `providers/kiro/src/index.ts` | `KiroProvider` class |
| Create | `providers/kiro/src/hook-reader.ts` | Session/event reading from JSONL files |
| Create | `providers/kiro/src/db-reader.ts` | SQLite conversation reader |
| Create | `providers/kiro/src/conversation-resolver.ts` | Tier 2 conversation ID resolution (prompt matching, progressive disambiguation) |
| Create | `providers/kiro/src/pid-tracker.ts` | Process liveness + stale cleanup |
| Modify | `server/src/index.ts` | Instantiate + inject provider |
| Modify | `server/src/routes/sessions.ts` | Use provider interface (including `POST /api/rename` via `findSessionByPid`) |
| Modify | `server/src/routes/events.ts` | Use provider interface (including `POST /api/view` via `findSessionByPid`) |
| Modify | `server/src/routes/orphans.ts` | Use provider interface |
| Modify | `server/src/services/keep-awake.ts` | Accept provider, call `hasActiveSessions()` |
| Delete | `server/src/services/storage.ts` | Moved to provider |
| Delete | `server/src/services/log-parser.ts` | Moved to provider |
| Modify | `server/package.json` | Add `@weaver/provider-kiro` dependency |
| Modify | `hook-handler/weaver-log.sh` | Use kiro conversation_id via parameterized SQLite query |
| Modify | `hook-handler/weaver-log.test.sh` | Update tests for new behavior |
| Modify | `package.json` (root) | Add `providers/kiro` to workspaces |
| Verify | `turbo.json` | Confirm new package is discovered and build-ordered correctly |
| Modify | `client/src/utils/api.ts` | Update return types for sessions + session detail |
| Modify | `client/src/pages/SessionsPage/constants.ts` | Add model, context, turns, cost, branch columns |
| Modify | `client/src/pages/SessionsPage/SessionsPage.tsx` | Include new columns in table tabs |
| Modify | `client/src/pages/SessionDetailPage/SessionDetailPage.tsx` | Render conversation content, branch banner, metadata |
| Modify | `client/src/pages/SessionDetailPage/components/TurnContainer.tsx` | Accept + render assistant responses and complete tool I/O |

---

## Testing Strategy

### Unit tests — provider-kiro (migrated from server)

Existing server tests migrate to the provider-kiro package. They test the provider implementation directly with mocked dependencies, not through the server's HTTP layer.

- `providers/kiro/src/db-reader.test.ts` — mock `better-sqlite3`, verify JSON parsing and type mapping (kiro history → ConversationMessage discriminated union, tangent_state → BranchState, usage_info → credit costs)
- `providers/kiro/src/conversation-resolver.test.ts` — test direct assignment (single unassigned conversation), conflict detection (two sessions claim same ID), prompt matching (multiple candidates with distinct prompts), progressive disambiguation (identical prompts, different subsequent messages), permanent fallback (unresolvable)
- `providers/kiro/src/hook-reader.test.ts` — migrate from `server/src/services/log-parser.test.ts`. Tests for `parseLogFile`, `groupEventsByTurn`, `matchToolCalls`, `deriveActivity`, `getLastEvent`
- `providers/kiro/src/pid-tracker.test.ts` — migrate from `server/src/services/storage.test.ts`. Tests for `isProcessRunning`, `cleanStaleSessions`, PID polling
- `providers/kiro/src/index.test.ts` — test `KiroProvider` with mocked hook-reader and db-reader. Verify `listSessions`, `getSessionDetail`, `hasActiveSessions`, orphan methods

### Unit tests — server (new, against provider interface)

Server route tests mock the `ConversationProvider` interface rather than individual service modules. This ensures the server is tested against the contract, not the implementation.

- `server/src/routes/sessions.test.ts` — rewrite to mock `ConversationProvider`. Test all routes including `POST /api/rename` (uses `findSessionByPid` + `updateSession`)
- `server/src/routes/events.test.ts` — test `POST /api/view` (uses `findSessionByPid`)

### Integration tests

- `hook-handler/weaver-log.test.sh` — verify count-checked fast path (single conversation → uses conversation_id), multi-conversation fallback (subagent burst → uuidgen), DB-missing fallback, sqlite3 CLI not available

### Manual testing

1. Start a kiro-cli session, verify weaver-log.sh picks up the kiro conversation_id
2. Open Weaver dashboard, verify session appears with correct ID
3. Verify session list shows enriched columns (model, context %, turns, estimated cost)
4. Verify session detail shows conversation content (assistant messages, tool I/O)
5. Enter tangent mode in kiro, verify branch indicator on session list and branch banner on detail page
6. Verify existing features still work: session list, activity status, rename, delete, orphans, SSE updates
7. Verify graceful degradation: sessions without conversation data (pre-change) still render with hook-only view
8. Verify `POST /api/rename` and `POST /api/view` work correctly through the provider
9. Verify keep-awake correctly detects active sessions through the provider

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| kiro conversation row doesn't exist at agentSpawn time | Session ID falls back to uuidgen, no conversation content | Fallback is built in; conversation content loads on subsequent notify events |
| kiro changes SQLite schema | db-reader breaks | Schema is isolated in `@weaver/provider-kiro` — fix is contained to one package. This is temporary until ACP client replaces it |
| `better-sqlite3` native module build issues in Electron | Provider fails to load in packaged app | Server runs as forked child process. Add `electron-rebuild` to desktop build pipeline. Pin `better-sqlite3` version for reproducible builds |
| `sqlite3` CLI not available on Linux | Hook can't read conversation_id | Fallback to uuidgen already handles this. Linux support is a future concern |
| Concurrent SQLite reads while kiro is writing | Potential lock contention | `better-sqlite3` in read-only mode uses WAL, no write locks needed |
| Subagent race condition (multiple agents in same CWD) | Wrong conversation_id assigned | Two-tier resolution: hook fast path (count check) handles single agent; provider resolver handles subagents via prompt matching + progressive disambiguation. Events held in orphan until resolved |
| Existing server tests break during migration | CI failures | Migrate tests to provider-kiro first, then rewrite server tests against provider interface. Run full suite before merging |
| Credit cost incomplete for historical sessions | Missing cost data for pre-change sessions | Show "—" for sessions without accumulated data. Running total begins from first notify after deployment |

---

## Dependencies

- `better-sqlite3` (npm) — synchronous SQLite reader for Node.js (native module, page-level reads)
- `@types/better-sqlite3` (npm, dev) — TypeScript types
- `sqlite3` (system) — CLI tool used by hook script (pre-installed on macOS)
- `electron-rebuild` (npm, dev) — for rebuilding native modules in packaged Electron app (add to desktop devDependencies)
- No infrastructure changes
- No external API changes (all endpoints remain backward-compatible)
