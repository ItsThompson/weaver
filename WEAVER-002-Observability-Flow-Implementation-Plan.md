# WEAVER-002: Observability Flow Implementation Plan

## Overview

Build the observability dashboard that displays kiro-cli conversation sessions logged via hooks. Users can browse sessions, view conversation timelines with tool call details, and assign custom names for organization.

### Success Criteria

- Dashboard lists all sessions from `~/.weaver/sessions.jsonl` with sortable columns (time, name, cwd, agent)
- Sessions are split into "Open" and "Closed" tabs based on kiro-cli PID liveness
- Clicking a session shows a chronological timeline of hook events (user prompts, tool calls, stop markers)
- Users can set/edit a custom name for any session inline
- Large tool responses are truncated in the UI with expand-on-click
- Dashboard auto-refreshes session list (polling or manual refresh)

### Assumptions & Constraints

- Architecture from WEAVER-001 is complete (server, client, shared types, storage service with stale session cleanup, hook scripts with PID-based session identification)
- Session status (open/closed) is computed at runtime by checking if the kiro-cli PID is still running — not stored in `sessions.jsonl`
- A resumed kiro-cli chat session is a separate Weaver session (new PID). The previous session appears in the Closed tab.
- Assistant text responses are NOT available via hooks — this is a known gap accepted for P1
- Hook logs may be large; the UI must handle pagination/virtualization for long sessions
- Depends on: WEAVER-001

---

## Approach

### Data Flow

```
kiro-cli hooks → weaver-log.sh → ~/.weaver/logs/<session-id>.jsonl
                                → ~/.weaver/sessions.jsonl (on agentSpawn, includes kiro-cli PID)
                                         ↓
                              Fastify server reads files
                              + checks PID liveness for open/closed status
                              + cleans stale .current-session-* files
                                         ↓
                              React dashboard renders (Open / Closed tabs)
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List all sessions with computed `status` (open/closed based on PID liveness) |
| `GET` | `/api/sessions/:id` | Get session metadata + parsed log events |
| `PATCH` | `/api/sessions/:id` | Update session custom name |

### UI Pages

1. **Sessions List** (`/`) — Cloudscape `Tabs` with "Open" and "Closed" tabs, each containing a `Table` with session data and inline editable name column
2. **Session Detail** (`/sessions/:id`) — Timeline view of hook events grouped by conversation turn

---

## Implementation Steps

### Step 1: Server — Session API routes

Add routes for listing, fetching, and updating sessions.

**Files:**
- `server/src/routes/sessions.ts` — register three routes:
  - `GET /api/sessions` — use existing `readSessions()` from `storage.ts`, for each session check PID liveness via existing `isProcessRunning()` from `storage.ts`, return array of `SessionWithStatus` sorted by `startTime` descending
  - `GET /api/sessions/:id` — read session from index + parse `~/.weaver/logs/<id>.jsonl` into array of `HookEvent` objects, return both
  - `PATCH /api/sessions/:id` — update `customName` field in `sessions.jsonl` for the given session ID (read full file, modify matching line, rewrite)
- `server/src/index.ts` — register sessions routes

**Validation:**
- Return 404 if session ID not found in index
- Return 404 if log file doesn't exist
- Validate PATCH body has `customName` as string

### Step 2: Server — Log parsing service

Parse JSONL log files into structured event data suitable for the timeline UI.

**Files:**
- `server/src/services/log-parser.ts`:
  - `parseLogFile(sessionId: string): HookEvent[]` — read JSONL, parse each line, return array
  - `groupEventsByTurn(events: HookEvent[]): TurnGroup[]` — group events into logical turns:
    - A turn starts with `userPromptSubmit` and ends with `stop`
    - Within a turn, `preToolUse`/`postToolUse` pairs are matched by `tool_name` + timestamp proximity
  - Handle malformed lines gracefully (skip + log warning)

**Types (add to `shared/types.ts`):**
```typescript
interface TurnGroup {
  id: number;
  userPrompt: string | null;       // From userPromptSubmit event, null for agentSpawn
  events: HookEvent[];             // All events in this turn
  toolCalls: ToolCallPair[];       // Matched pre/post pairs
  startTime: string;
  endTime: string;
}

interface ToolCallPair {
  toolName: string;
  input: Record<string, unknown>;
  response?: Record<string, unknown>;  // From postToolUse, may be truncated
  startTime: string;
  endTime?: string;
}
```

### Step 3: Client — Sessions list page

Build the main dashboard page showing all sessions in a Cloudscape Table.

**Files:**
- `client/src/pages/SessionsPage.tsx`:
  - Fetch `GET /api/sessions` on mount
  - Cloudscape `Tabs` component with two tabs: "Open" (sessions where `status === "open"`) and "Closed" (sessions where `status === "closed"`)
  - Each tab contains a Cloudscape `Table` with columns: Custom Name (editable), Session ID, CWD, Agent, Start Time, Last Event
  - Custom Name column uses inline `Input` on click, saves via `PATCH /api/sessions/:id`
  - Cloudscape `Header` with refresh button
  - Empty state when no sessions exist in a tab
  - `TextFilter` for filtering sessions by name/cwd

### Step 4: Client — Session detail page

Build the timeline view for a single session's hook events.

**Files:**
- `client/src/pages/SessionDetailPage.tsx`:
  - Fetch `GET /api/sessions/:id` on mount
  - Cloudscape `BreadcrumbGroup` for navigation back to sessions list
  - Render each `TurnGroup` as a `Container` with:
    - User prompt text (from `userPromptSubmit`) displayed at the top
    - Tool calls shown as `ExpandableSection` items within the turn:
      - Tool name as badge
      - Collapsed: one-line summary (tool name + truncated input)
      - Expanded: full `tool_input` and `tool_response` as formatted JSON (`CodeView` or `<pre>`)
    - `stop` event shown as a subtle turn-end divider
  - `agentSpawn` rendered as a session-start marker at the top
  - Timestamps shown relative (e.g., "+2.3s") within a turn, absolute for turn starts

- `client/src/components/ToolCallCard.tsx`:
  - Renders a single `ToolCallPair`
  - Tool name as Cloudscape `Badge`
  - Truncated response with "Show full response" toggle
  - JSON syntax highlighting for input/response

### Step 5: Client — API integration and context

Wire up the API calls and loading/error states.

**Files:**
- `client/src/utils/api.ts` — add typed functions using the existing `apiFetch<T>()` wrapper:
  - `getSessions(): Promise<SessionWithStatus[]>`
  - `getSession(id: string): Promise<{ session: SessionWithStatus; turns: TurnGroup[] }>`
  - `updateSessionName(id: string, customName: string): Promise<Session>`
- `client/src/context/AppContext.tsx` — create sessions state, loading flags, and dispatch actions

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `shared/types.ts` | Modify | Add `TurnGroup`, `ToolCallPair` interfaces |
| `server/src/routes/sessions.ts` | Create | Session CRUD API routes |
| `server/src/services/log-parser.ts` | Create | JSONL parsing and turn grouping logic |
| `server/src/index.ts` | Modify | Register session routes |
| `server/__tests__/services/log-parser.test.ts` | Create | Unit tests for log parsing and turn grouping |
| `server/__tests__/routes/sessions.test.ts` | Create | Unit tests for session API routes |
| `client/src/pages/SessionsPage.tsx` | Modify | Replace placeholder with sessions table |
| `client/src/pages/SessionDetailPage.tsx` | Create | Session timeline detail view |
| `client/src/components/ToolCallCard.tsx` | Create | Tool call display component |
| `client/src/utils/api.ts` | Modify | Add session API functions |
| `client/src/context/AppContext.tsx` | Create | Sessions state management (deferred from WEAVER-001) |
| `client/src/App.tsx` | Modify | Add route for `/sessions/:id` |

---

## Testing Strategy

All server-side tests use Jest with ts-jest (configured in `server/jest.config.mjs` from WEAVER-001). Test files live in `server/__tests__/` mirroring the `src/` structure.

### Unit Tests
- `server/__tests__/services/log-parser.test.ts` — test with sample JSONL data:
  - Parses valid JSONL into HookEvent array
  - Skips malformed lines without crashing
  - Groups events into correct TurnGroups
  - Matches preToolUse/postToolUse pairs correctly
  - Handles parallel tool calls (same timestamp) as separate pairs within one turn
- `server/__tests__/routes/sessions.test.ts` — test with mock storage:
  - GET returns sorted sessions
  - GET /:id returns 404 for missing session
  - PATCH updates customName and persists

### Integration Tests
- Full flow: write a test JSONL file → call GET /api/sessions/:id → verify parsed turn structure

### Manual Testing
1. Run a kiro-cli conversation with hooks enabled
2. Open dashboard — verify session appears in list
3. Click into session — verify timeline matches the conversation
4. Edit custom name — verify it persists on refresh
5. Verify large tool responses are truncated with expand toggle

---

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Large JSONL files slow down session detail loading | Stream/paginate log parsing; only parse on request, don't preload all sessions' logs |
| Concurrent writes to sessions.jsonl (hook script append + server PATCH rewrite) | PATCH does a full read-modify-rewrite of sessions.jsonl. Hook appends (`>>`) are atomic and append-only, so a concurrent append during a PATCH rewrite could be lost. Acceptable for this local tool — PATCH is infrequent (manual name edits) and a refresh will pick up any missed appends. |
| Hook log format changes in future kiro-cli versions | Parse defensively; unknown fields are ignored, missing fields default to null |
| No assistant text in timeline feels incomplete | Show clear "Assistant response not captured by hooks" note; document that `/chat save` import (future) would fill this gap |
| Resumed chat sessions appear as separate Weaver sessions | Acceptable — kiro-cli auto-summarizes loaded conversations, so the new session's first `userPromptSubmit` hook will contain the summary context. The previous session remains in the Closed tab for reference. |

---

## Dependencies

- WEAVER-001 (architecture) must be complete
- kiro-cli hooks must be installed and generating logs in `~/.weaver/logs/`
- No external services
