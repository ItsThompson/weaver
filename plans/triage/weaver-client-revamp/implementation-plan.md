# Weaver Client Revamp: Implementation Plan

## Overview

Revamp the Weaver Electron dashboard to leverage the rich data now available from the ACP client's SQLite database. The ACP client owns the full conversation: assistant responses, tool call details (kind, status, permission), session metadata (model, context usage). The dashboard currently shows only user prompts and tool call pairs. This plan upgrades it to a full conversation viewer with rendered markdown, integrated cherrypick, and a bidirectional SSE channel that enables the dashboard to send commands back to the ACP client (for live cherrypick reload and mini-page tool approval).

### Coding Standards

Enforced across every step. Violations are blockers.

- **ESM only**: `import`/`export`, `node:` prefix for builtins, named exports (never default)
- **Types in dedicated files**: `types.ts` or `schemas.ts`, separate from implementation
- **One responsibility per file**: section comments like `// --- Foo ---` mean the file should be split
- **Guard clauses**: prefer early returns over nested conditionals
- **Named exports only**: never use default exports
- **React patterns**: use theme values from design system, no hardcoded colors. Import order: React, external, internal, local
- **Component decomposition**: complex features get a directory with hook, components, types. Orchestrator composes hook + sub-components. Hook returns `{ state, actions }`.
- **Testing**: unit tests for non-trivial logic. Never weaken a test to make it pass. Match existing repo conventions.

### Success Criteria

- Session detail page shows full conversation: user prompts, rendered markdown assistant responses, enriched tool call cards
- Cherrypick is integrated into session detail: toggle turns on/off, apply live reload to the running ACP agent
- Mini page shows current activity detail and approve/reject buttons for pending tool approvals
- Session list shows model and context usage columns
- SSE reverse channel enables dashboard-to-ACP-client communication
- Orphans page and old file-upload cherrypick page are removed
- All existing tests pass, new tests cover new functionality

### Architecture: SSE Reverse Channel

The key infrastructure addition. The ACP client subscribes to the server's existing SSE endpoint on startup. The server gains targeted event types that the ACP client listens for.

```
Dashboard              Server                 ACP Client            kiro-cli
  |                      |                       |                     |
  | POST /api/command    |                       |                     |
  |--------------------->|                       |                     |
  |                      | SSE: { event:         |                     |
  |                      |   "session_command" }  |                     |
  |                      |---------------------->|                     |
  |                      |                       | executeCommand()    |
  |                      |                       |-------------------->|
  |                      |                       |                     |
  |                      | POST /api/notify      |                     |
  |                      |<----------------------|                     |
  | SSE: { event:        |                       |                     |
  |   "update" }         |                       |                     |
  |<---------------------|                       |                     |
```

For cherrypick, the ACP client handles the full orchestration locally:
1. Receives `{ action: 'cherrypick', excludedTurnIds }` via SSE
2. Forwards `/chat save /tmp/weaver-cp-<uuid>.json` to kiro-cli
3. Reads the saved file, applies `pruneConversation()`, writes pruned file
4. Forwards `/chat load /tmp/weaver-cp-<uuid>-pruned.json` to kiro-cli
5. Notifies server of success/failure

For tool approval from mini page:
1. ACP client notifies server when `requestPermission` arrives (includes tool details + options)
2. Server broadcasts via SSE to dashboard
3. Mini page shows approve/reject buttons
4. User clicks approve: dashboard POSTs to server
5. Server emits targeted SSE to ACP client with the selected option
6. ACP client resolves the pending `requestPermission` promise
7. Meanwhile, TUI also shows the approval prompt: first response (TUI or dashboard) wins

## Implementation Steps

### Step 1: Schema migration and shared utilities

Add `excluded` column to the messages table. Move cherrypick parsing/pruning logic from client to shared so both client and ACP client can use it. Bump schema version.

**Schema change:**
```sql
ALTER TABLE messages ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0;
```

Schema version bumps from 1 to 2. The `applySchema` method in `WeaverDb` needs migration support: detect version 1, run ALTER TABLE, update version.

**Move to shared:**
- `client/src/utils/conversation-parser.ts` logic (groupIntoExchanges, pruneConversation, regenerateTranscript) moves to `shared/utils/conversation-parser.ts`
- `client/src/types/conversation.ts` types move to `shared/types/conversation.ts`
- Client imports updated to use `@weaver/shared`

**Extend Session type:**
Add `model`, `contextUsagePercent` to the `Session` interface in `shared/types/session.ts`. Update `rowToSession` in the server's storage service to include these fields.

**Files:**
- Modify `shared/db/weaver-db.ts`: add migration support (v1 -> v2: add excluded column)
- Modify `shared/db/schema.sql`: add excluded column to messages table
- Create `shared/utils/conversation-parser.ts`: move from client
- Create `shared/types/conversation.ts`: move from client
- Modify `shared/package.json`: add exports for new modules
- Modify `shared/types/session.ts`: add model, contextUsagePercent to Session
- Modify `server/src/services/storage/storage.ts`: update rowToSession
- Modify `client/src/utils/conversation-parser.ts`: re-export from shared
- Modify `client/src/types/conversation.ts`: re-export from shared

**Acceptance criteria:**
- Schema migration runs on existing DBs (v1 -> v2) without data loss
- `pruneConversation` importable from `@weaver/shared/utils`
- Session API returns model and contextUsagePercent
- All existing tests pass
- New migration test: open v1 DB, verify migration to v2

---

### Step 2: Markdown rendering infrastructure

Add markdown rendering to the client. Create a reusable `MarkdownRenderer` component that handles GitHub-flavored markdown with syntax-highlighted code blocks.

**Dependencies:**
- `react-markdown` (renders markdown to React components)
- `remark-gfm` (GitHub-flavored markdown: tables, strikethrough, task lists)
- `react-syntax-highlighter` (code block highlighting)

**Component:**
```typescript
// client/src/components/MarkdownRenderer/MarkdownRenderer.tsx
interface MarkdownRendererProps {
  content: string;
  compact?: boolean; // reduced spacing for inline use
}
```

Key behaviors:
- Code blocks: syntax highlighted with a dark theme matching Cloudscape dark mode
- Inline code: styled with monospace font and subtle background
- Links: open in external browser (Electron) or new tab (browser)
- Images: not rendered (out of scope)
- Tables: styled to match Cloudscape table aesthetics
- Compact mode: reduced margins/padding for use inside cards

**Files:**
- Create `client/src/components/MarkdownRenderer/MarkdownRenderer.tsx`
- Create `client/src/components/MarkdownRenderer/index.ts`
- Create `client/src/components/MarkdownRenderer/styles.css` (scoped styles)
- Modify `client/package.json`: add react-markdown, remark-gfm, react-syntax-highlighter, @types/react-syntax-highlighter

**Acceptance criteria:**
- MarkdownRenderer renders headings, code blocks, lists, tables, inline code
- Code blocks have syntax highlighting with language detection
- Dark theme matches Cloudscape dark mode
- Compact mode reduces spacing
- Unit test: renders markdown string, verifies code block and heading elements exist

---

### Step 3: Session detail: assistant responses

Update the session detail page to show assistant responses using the MarkdownRenderer. Remove the "Assistant responses are not available" notice. Restructure turns as a conversation flow.

**TurnContainer changes:**
- Show user prompt in a distinct "user bubble" style
- Show `turn.assistantContent` rendered via MarkdownRenderer below the prompt
- Tool calls shown between prompt and response (chronological order)
- If `assistantContent` is null/empty, show "No response captured" in dim text
- Remove the `firstEvent === 'agentSpawn'` special case (no longer relevant with SQLite data)

**Layout per turn:**
```
┌─ Turn 3 ──────────────────────────────────────────────┐
│ User: "Add error handling to the upload function"      │
│                                                        │
│ 🔧 fs_read — /src/upload.ts                    [done]  │
│ 🔧 fs_write — /src/upload.ts                   [done]  │
│                                                        │
│ Assistant:                                             │
│ I've added try/catch blocks around the S3 upload...    │
│ ```typescript                                          │
│ try {                                                  │
│   await s3.upload(params);                             │
│ } catch (err) { ... }                                  │
│ ```                                                    │
└────────────────────────────────────────────────────────┘
```

**Files:**
- Rewrite `client/src/pages/SessionDetailPage/components/TurnContainer.tsx`
- Modify `client/src/pages/SessionDetailPage/SessionDetailPage.tsx`: remove "not available" notice

**Acceptance criteria:**
- Assistant responses render as markdown with syntax highlighting
- User prompts display in a visually distinct style
- Tool calls appear in chronological position within the turn
- Turns without assistant content show a placeholder
- Existing SessionDetailPage tests updated and passing

---

### Step 4: ToolCallCard upgrade

Upgrade the ToolCallCard to use the richer `ToolCallDetail` data from SQLite. Show kind, status, permission response.

**New ToolCallCard layout:**
```
🔧 fs_write [edit] ─ /src/upload.ts          ✅ completed  0.8s
   Permission: allowed once
   ▸ Input  { "command": "str_replace", "path": "/src/upload.ts", ... }
   ▸ Output { "success": true }
```

**Changes:**
- Accept both `ToolCallPair` (legacy) and `ToolCallDetail` (new) via a union prop
- Kind badge: `read` (blue), `edit` (orange), `execute` (purple), default (grey)
- Status indicator: `pending` (spinner), `in_progress` (spinner), `completed` (green check), `failed` (red x)
- Permission response: `allow_once` -> "allowed", `allow_always` -> "trusted", `reject_once` -> "rejected"
- Collapsible input/output (default collapsed, click to expand)

**Files:**
- Rewrite `client/src/components/ToolCallCard/ToolCallCard.tsx`
- Create `client/src/components/ToolCallCard/types.ts`: prop types
- Modify `client/src/pages/SessionDetailPage/components/TurnContainer.tsx`: pass toolCallDetails when available

**Acceptance criteria:**
- Kind badge displays with correct color
- Status indicator shows correct icon
- Permission response displays when present
- Input/output collapsible with JSON formatting
- Falls back gracefully when only ToolCallPair data is available
- Existing ToolCallCard tests updated and passing

---

### Step 5: Session detail header and session list enrichment

Add model, context usage, and agent name to the session detail header. Add model and context usage columns to the session list table.

**Session detail header changes:**
- Show model name as a badge (e.g., "claude-opus-4.6-1m")
- Show context usage as a small progress bar or percentage badge
- Show agent name if present

**Session list changes:**
- Add MODEL column: displays `session.model` or "unknown"
- Add CONTEXT column: displays context usage as a percentage or small bar
- Add to both OPEN_COLUMNS and CLOSED_COLUMNS
- Add to display options (visible by default for open, hidden by default for closed)

**Files:**
- Modify `client/src/pages/SessionDetailPage/SessionDetailPage.tsx`: add model/context/agent to header
- Modify `client/src/pages/SessionsPage/constants.ts`: add MODEL and CONTEXT columns
- Modify `client/src/pages/SessionsPage/components/SessionTable.tsx`: no changes needed (columns are data-driven)

**Acceptance criteria:**
- Session detail header shows model, context %, agent name
- Session list has model and context columns
- Context usage updates when session data refreshes
- Existing tests updated and passing

---

### Step 6: SSE reverse channel: server endpoints

Add server-side infrastructure for sending targeted commands to specific ACP client sessions via SSE. The server gains a new `session_command` SSE event type and a `POST /api/sessions/:id/command` endpoint.

**New endpoint:**
```
POST /api/sessions/:id/command
Body: { action: string, ...params }
```

Actions:
- `execute_command`: forward a slash command to the ACP client
- `cherrypick`: trigger the cherrypick flow with excluded turn IDs
- `approval_response`: respond to a pending tool approval

**Event bus changes:**
- New `emitToSession(sessionId, event, data)` function that emits a targeted SSE event
- New SSE event type: `session_command` (only sent to listeners for that session)
- ACP client subscribes with `?sessionId=<id>` query param so the server can target events

**New notification endpoint for approval requests:**
```
POST /api/sessions/:id/approval-request
Body: { toolCallId, toolName, title, kind, options }
```
Broadcasts `permission_request` SSE event to all dashboard listeners.

**Files:**
- Modify `server/src/services/event-bus.ts`: add `emitToSession()`, session-scoped listeners
- Create `server/src/routes/commands/commands.ts`: POST /api/sessions/:id/command
- Create `server/src/routes/commands/index.ts`: barrel export
- Modify `server/src/routes/events/events.ts`: support `?sessionId` query param for targeted SSE
- Modify `server/src/index.ts`: register new routes

**Acceptance criteria:**
- `POST /api/sessions/:id/command` emits a `session_command` SSE event
- SSE listeners with `?sessionId` param only receive events for that session
- `POST /api/sessions/:id/approval-request` broadcasts `permission_request` to all listeners
- Unit tests verify targeted event delivery

---

### Step 7: SSE reverse channel: ACP client subscriber

The ACP client subscribes to the server's SSE endpoint on startup and handles incoming commands. This enables the dashboard to trigger actions in the running ACP client.

**ACP client changes:**
- On startup (after session creation), connect to `GET /api/events?sessionId=<internalId>`
- Listen for `session_command` events
- Dispatch based on `action` field:
  - `execute_command`: call `adapter.executeCommand(sessionId, command)`
  - `cherrypick`: run the full cherrypick orchestration (save, prune, load)
  - `approval_response`: resolve the pending requestPermission promise
- Queue commands when a prompt is in progress, execute when idle
- Reconnect on SSE disconnect (with backoff)

**Approval dual-input:**
- Modify `requestApproval` to support resolution from both TUI and SSE
- Create a shared promise resolver: `createApprovalResolver()` returns `{ promise, resolveFromTui, resolveFromSse }`
- When requestPermission arrives: notify server (for dashboard), start TUI prompt, race both
- First response wins, other is cancelled

**Cherrypick orchestration:**
- Receives `{ action: 'cherrypick', excludedTurnIds: number[] }`
- Generates temp paths: `/tmp/weaver-cp-<uuid>.json`, `/tmp/weaver-cp-<uuid>-pruned.json`
- Forwards `/chat save <savePath>` to kiro-cli via adapter
- Reads saved file, calls `pruneConversation()` from shared
- Writes pruned file
- Forwards `/chat load <prunedPath>` to kiro-cli via adapter
- Marks excluded messages in SQLite: `UPDATE messages SET excluded = 1 WHERE ...`
- Notifies server: `POST /api/notify { sessionId, eventName: 'cherrypick_complete' }`
- Cleans up temp files

**Files:**
- Create `acp-client/src/tui/sse-listener.ts`: SSE subscription and command dispatch
- Create `acp-client/src/tui/approval-resolver.ts`: dual-input approval promise
- Create `acp-client/src/tui/cherrypick.ts`: cherrypick orchestration
- Modify `acp-client/src/tui/index.ts`: start SSE listener, wire approval resolver
- Modify `acp-client/src/tui/approval.ts`: use approval resolver for dual-input
- Add `@weaver/shared` utils import for pruneConversation

**Acceptance criteria:**
- ACP client connects to server SSE on startup
- `execute_command` action forwards commands to kiro-cli
- Cherrypick action: saves, prunes, loads, marks excluded in SQLite
- Approval response from SSE resolves the pending TUI prompt
- TUI approval still works (first response wins)
- Reconnects on SSE disconnect
- Unit tests: mock SSE, verify command dispatch and cherrypick flow

---

### Step 8: Cherrypick UI in session detail

Add turn-level checkboxes to the session detail page. Users can select turns to exclude, preview the selection, and apply the cherrypick.

**UI changes to SessionDetailPage:**
- Add a "Cherrypick" toggle button in the header actions
- When active: each turn shows a checkbox (checked = included, unchecked = excluded)
- Excluded turns are visually dimmed (reduced opacity)
- Turns already marked as `excluded` in SQLite are pre-checked as excluded and dimmed
- Bottom action bar appears: "Apply (N turns excluded)" button, "Cancel" button, "Select All" / "Deselect All"
- Apply button calls `POST /api/sessions/:id/command { action: 'cherrypick', excludedTurnIds: [...] }`

**State management:**
- `useCherrypickMode` hook: tracks cherrypick active state, excluded turn IDs, loading state
- Returns `{ state: { active, excludedIds, isApplying }, actions: { toggle, toggleTurn, apply, cancel, selectAll, deselectAll } }`

**Files:**
- Create `client/src/pages/SessionDetailPage/hooks/useCherrypickMode.ts`
- Create `client/src/pages/SessionDetailPage/components/CherrypickBar.tsx`: bottom action bar
- Modify `client/src/pages/SessionDetailPage/components/TurnContainer.tsx`: add checkbox prop, dimming
- Modify `client/src/pages/SessionDetailPage/SessionDetailPage.tsx`: wire cherrypick mode

**Acceptance criteria:**
- Cherrypick toggle activates checkbox mode
- Turns can be toggled individually or all at once
- Already-excluded turns show as pre-excluded
- Apply sends the correct API call
- Loading state shown during apply
- Success: turns refresh with updated excluded state
- Cancel: resets to original state
- Unit tests for useCherrypickMode hook

---

### Step 9: Mini page: activity detail

Upgrade the mini page to show current activity detail for each open session. Replace the simple colored dot with contextual information.

**Per-session display:**
- Idle: last prompt snippet (truncated to ~60 chars)
- Running tool: `🔧 <tool_name>` with tool name
- Pending approval: `⚠ Awaiting: <tool_name>` in warning color
- Processing: `⏳ Thinking...`
- Starting: `🔄 Starting...`

**Data source:**
The server's SSE `update` events already include `eventName`. Enrich them to include `toolName` when the event is `preToolUse` or `postToolUse`. The ACP client's `notifyServer` calls need to pass tool name.

**ACP client changes:**
- `notifyServer` gains optional `toolName` parameter
- Call `notifyServer(sessionId, 'preToolUse', toolName)` when a tool call starts
- Call `notifyServer(sessionId, 'postToolUse', toolName)` when a tool call completes

**Server changes:**
- `POST /api/notify` accepts optional `toolName` field
- `broadcast()` includes `toolName` in SSE data

**Client changes:**
- `ActivityLogContext` tracks per-session activity detail (tool name, last prompt)
- Mini page reads from this context
- New `useSessionActivity` hook: derives display text from latest SSE event per session

**Files:**
- Modify `acp-client/src/storage/event-emitter.ts`: add toolName param to notifyServer
- Modify `acp-client/src/tui/index.ts`: pass toolName in notify calls
- Modify `server/src/routes/events/events.ts`: accept and broadcast toolName
- Modify `server/src/services/event-bus.ts`: include toolName in broadcast data
- Create `client/src/hooks/useSessionActivity/useSessionActivity.ts`: per-session activity tracking
- Create `client/src/hooks/useSessionActivity/index.ts`
- Modify `client/src/pages/MiniPage/MiniPage.tsx`: use activity detail display

**Acceptance criteria:**
- Mini page shows tool name when agent is running a tool
- Mini page shows "Awaiting: tool_name" for pending approvals
- Mini page shows last prompt snippet when idle
- Activity updates in real-time via SSE
- Unit test for useSessionActivity hook

---

### Step 10: Mini page: approve/reject buttons

Add approve/reject buttons to the mini page for pending tool approvals. Uses the SSE reverse channel from step 7.

**UI:**
When a session has `activity === 'pending_approval'`, show:
```
⚠ Awaiting: fs_write
  [✓ Allow]  [✗ Reject]  [🔒 Trust]
```

Buttons map to ACP permission options:
- Allow -> `allow_once`
- Reject -> `reject_once`
- Trust -> `allow_always`

**Data flow:**
1. ACP client receives `requestPermission`, calls `POST /api/sessions/:id/approval-request` with tool details and options
2. Server broadcasts `permission_request` SSE event with `{ sessionId, toolCallId, toolName, title, kind, options }`
3. Mini page shows buttons
4. User clicks: dashboard calls `POST /api/sessions/:id/command { action: 'approval_response', toolCallId, optionId }`
5. Server emits targeted SSE to ACP client
6. ACP client resolves the pending approval promise

**State management:**
- `usePendingApprovals` hook: tracks pending approvals per session from SSE events
- Clears when `postToolUse` or `stop` event arrives for that session
- Returns `Map<sessionId, { toolCallId, toolName, title, options }>`

**Files:**
- Create `client/src/hooks/usePendingApprovals/usePendingApprovals.ts`
- Create `client/src/hooks/usePendingApprovals/index.ts`
- Create `client/src/pages/MiniPage/components/ApprovalButtons.tsx`
- Modify `client/src/pages/MiniPage/MiniPage.tsx`: show approval buttons for pending sessions
- Modify `client/src/utils/api.ts`: add `sendSessionCommand` function
- Modify `acp-client/src/tui/index.ts`: call approval-request endpoint when requestPermission arrives

**Acceptance criteria:**
- Pending approval shows tool name and approve/reject/trust buttons
- Clicking approve resolves the tool call in the TUI
- Clicking reject rejects the tool call
- Clicking trust auto-approves future calls for that tool
- Buttons disappear after approval is resolved (from either TUI or dashboard)
- If user approves in TUI first, buttons disappear from mini page
- Unit tests for usePendingApprovals hook

---

### Step 11: Granular SSE notifications

Add more granular notifications from the ACP client so the dashboard updates more frequently. Currently only `session_start`, `session_end`, `turn_end` are sent.

**New notifications:**
- `tool_call_start`: when a tool call begins (includes tool name, kind)
- `tool_call_complete`: when a tool call finishes (includes tool name, status)
- `prompt_start`: when user sends a prompt
- `context_update`: when context usage changes significantly (>5% delta)

**ACP client changes:**
- Add notifyServer calls in the client handler callbacks
- Throttle `context_update` to avoid flooding (max once per 5s)

**Dashboard benefits:**
- Session list activity column updates on tool call start/complete (not just turn end)
- Session detail auto-refreshes on tool call complete (shows new tool results)
- Context usage updates in near-real-time

**Files:**
- Modify `acp-client/src/tui/index.ts`: add notify calls for tool_call_start, tool_call_complete, prompt_start
- Modify `acp-client/src/adapters/kiro/extensions.ts`: notify on context_update
- Modify `client/src/hooks/useSessionEvents/useSessionEvents.ts`: handle new event types (trigger refetch)

**Acceptance criteria:**
- Dashboard session list updates activity on tool call start/complete
- Session detail refreshes when tool calls complete
- Context usage updates without manual refresh
- No flooding: context_update throttled to max once per 5s

---

### Step 12: Remove orphans page and old cherrypick page

Clean up deprecated features. The orphans page is no longer relevant (ACP client creates all sessions). The old file-upload cherrypick page is replaced by the integrated cherrypick in session detail.

**Removals:**
- Delete `client/src/pages/OrphansPage/` directory
- Delete `client/src/pages/CherrypickPage/` directory (the old upload-based flow)
- Delete `server/src/routes/orphans/` directory
- Remove orphan-related queries from `client/src/hooks/queries/`
- Remove "Cherrypick" and orphan button from navigation
- Remove `/cherrypick` and `/sessions/orphans` routes from App.tsx
- Remove orphan count query from SessionsPage

**Navigation update:**
```typescript
const NAV_ITEMS = [
  { type: 'link', text: 'Sessions', href: '/' },
  { type: 'link', text: 'Settings', href: '/settings' },
  { type: 'link', text: 'Command Palette', href: '#command-palette' },
];
```

**Files:**
- Delete `client/src/pages/OrphansPage/`
- Delete `client/src/pages/CherrypickPage/`
- Delete `server/src/routes/orphans/`
- Modify `client/src/App.tsx`: remove routes and nav items
- Modify `client/src/pages/SessionsPage/SessionsPage.tsx`: remove orphan button and query
- Modify `client/src/hooks/queries/queries.ts`: remove orphan query
- Modify `server/src/index.ts`: remove orphan route registration

**Acceptance criteria:**
- No orphan or old cherrypick routes exist
- Navigation shows only Sessions, Settings, Command Palette
- All remaining tests pass
- No dead imports or references to removed modules

---

### Step 13: Polish and integration testing

Final cleanup, cross-cutting concerns, and end-to-end verification.

**Cleanup tasks:**
- Remove unused conversation-parser utilities from client (now in shared)
- Remove unused types from client/src/types/conversation.ts (now in shared)
- Verify all imports resolve correctly after moves
- Run `turbo build` for all packages
- Run `turbo test` for all packages

**Integration test scenarios (manual):**
1. `weaver chat` -> send prompt -> open dashboard -> see full conversation with markdown
2. Session detail -> enable cherrypick -> exclude 2 turns -> apply -> agent reloads with pruned context
3. Mini page -> agent runs tool -> see tool name -> agent requests approval -> see approve/reject buttons -> click approve -> tool executes
4. Mini page -> agent requests approval -> approve in TUI instead -> buttons disappear from mini page
5. Session list -> verify model and context % columns
6. Multiple sessions -> each shows independent activity in mini page
7. Kill terminal -> session marked closed -> dashboard updates

**Files:**
- Clean up dead imports across client, server, acp-client
- Verify `turbo build` and `turbo test` pass
- Verify `npm run app` (Electron) works
- Verify `npm run dev` (browser) works

**Acceptance criteria:**
- All build and test commands pass
- All manual test scenarios pass
- No dead code or unused imports
- Electron app launches and displays correctly
- Browser dev mode works with hot reload


## Files to Modify/Create

| Action | File | Step | Description |
|--------|------|------|-------------|
| **Modify** | `shared/db/weaver-db.ts` | 1 | Add migration support (v1->v2: excluded column) |
| **Modify** | `shared/db/schema.sql` | 1 | Add excluded column to messages |
| **Create** | `shared/utils/conversation-parser.ts` | 1 | Move from client |
| **Create** | `shared/types/conversation.ts` | 1 | Move from client |
| **Modify** | `shared/types/session.ts` | 1 | Add model, contextUsagePercent |
| **Modify** | `shared/package.json` | 1 | Add new exports |
| **Modify** | `server/src/services/storage/storage.ts` | 1 | Update rowToSession |
| **Modify** | `client/src/utils/conversation-parser.ts` | 1 | Re-export from shared |
| **Modify** | `client/src/types/conversation.ts` | 1 | Re-export from shared |
| **Create** | `client/src/components/MarkdownRenderer/MarkdownRenderer.tsx` | 2 | Markdown component |
| **Create** | `client/src/components/MarkdownRenderer/index.ts` | 2 | Barrel export |
| **Create** | `client/src/components/MarkdownRenderer/styles.css` | 2 | Scoped styles |
| **Modify** | `client/package.json` | 2 | Add markdown dependencies |
| **Rewrite** | `client/src/pages/SessionDetailPage/components/TurnContainer.tsx` | 3 | Show assistant responses |
| **Modify** | `client/src/pages/SessionDetailPage/SessionDetailPage.tsx` | 3 | Remove "not available" notice |
| **Rewrite** | `client/src/components/ToolCallCard/ToolCallCard.tsx` | 4 | Kind/status/permission |
| **Create** | `client/src/components/ToolCallCard/types.ts` | 4 | Prop types |
| **Modify** | `client/src/pages/SessionDetailPage/SessionDetailPage.tsx` | 5 | Model/context in header |
| **Modify** | `client/src/pages/SessionsPage/constants.ts` | 5 | Model/context columns |
| **Modify** | `server/src/services/event-bus.ts` | 6 | Add emitToSession, session-scoped listeners |
| **Create** | `server/src/routes/commands/commands.ts` | 6 | Command endpoint |
| **Create** | `server/src/routes/commands/index.ts` | 6 | Barrel export |
| **Modify** | `server/src/routes/events/events.ts` | 6 | Session-scoped SSE, approval-request |
| **Modify** | `server/src/index.ts` | 6 | Register new routes |
| **Create** | `acp-client/src/tui/sse-listener.ts` | 7 | SSE subscription |
| **Create** | `acp-client/src/tui/approval-resolver.ts` | 7 | Dual-input approval |
| **Create** | `acp-client/src/tui/cherrypick.ts` | 7 | Cherrypick orchestration |
| **Modify** | `acp-client/src/tui/index.ts` | 7 | Wire SSE listener, approval resolver |
| **Modify** | `acp-client/src/tui/approval.ts` | 7 | Use approval resolver |
| **Create** | `client/src/pages/SessionDetailPage/hooks/useCherrypickMode.ts` | 8 | Cherrypick state |
| **Create** | `client/src/pages/SessionDetailPage/components/CherrypickBar.tsx` | 8 | Action bar |
| **Modify** | `client/src/pages/SessionDetailPage/components/TurnContainer.tsx` | 8 | Checkbox, dimming |
| **Modify** | `client/src/pages/SessionDetailPage/SessionDetailPage.tsx` | 8 | Wire cherrypick mode |
| **Modify** | `acp-client/src/storage/event-emitter.ts` | 9 | Add toolName param |
| **Modify** | `acp-client/src/tui/index.ts` | 9 | Pass toolName in notify |
| **Modify** | `server/src/routes/events/events.ts` | 9 | Accept/broadcast toolName |
| **Modify** | `server/src/services/event-bus.ts` | 9 | Include toolName |
| **Create** | `client/src/hooks/useSessionActivity/useSessionActivity.ts` | 9 | Activity tracking |
| **Create** | `client/src/hooks/useSessionActivity/index.ts` | 9 | Barrel export |
| **Modify** | `client/src/pages/MiniPage/MiniPage.tsx` | 9 | Activity detail display |
| **Create** | `client/src/hooks/usePendingApprovals/usePendingApprovals.ts` | 10 | Approval tracking |
| **Create** | `client/src/hooks/usePendingApprovals/index.ts` | 10 | Barrel export |
| **Create** | `client/src/pages/MiniPage/components/ApprovalButtons.tsx` | 10 | Approve/reject UI |
| **Modify** | `client/src/pages/MiniPage/MiniPage.tsx` | 10 | Show approval buttons |
| **Modify** | `client/src/utils/api.ts` | 10 | Add sendSessionCommand |
| **Modify** | `acp-client/src/tui/index.ts` | 11 | Granular notify calls |
| **Modify** | `acp-client/src/adapters/kiro/extensions.ts` | 11 | Context update notify |
| **Modify** | `client/src/hooks/useSessionEvents/useSessionEvents.ts` | 11 | Handle new events |
| **Delete** | `client/src/pages/OrphansPage/` | 12 | Remove orphans page |
| **Delete** | `client/src/pages/CherrypickPage/` | 12 | Remove old cherrypick |
| **Delete** | `server/src/routes/orphans/` | 12 | Remove orphan routes |
| **Modify** | `client/src/App.tsx` | 12 | Remove routes and nav |
| **Modify** | `client/src/pages/SessionsPage/SessionsPage.tsx` | 12 | Remove orphan button |
| **Modify** | `client/src/hooks/queries/queries.ts` | 12 | Remove orphan query |
| **Modify** | `server/src/index.ts` | 12 | Remove orphan registration |

## Testing Strategy

### Unit Tests: shared
- `shared/db/weaver-db.test.ts`: migration from v1 to v2, excluded column behavior
- `shared/utils/conversation-parser.test.ts`: move existing tests from client

### Unit Tests: client
- `client/src/components/MarkdownRenderer/MarkdownRenderer.test.tsx`: renders markdown elements
- `client/src/pages/SessionDetailPage/hooks/useCherrypickMode.test.ts`: toggle, apply, cancel
- `client/src/hooks/useSessionActivity/useSessionActivity.test.ts`: derives display text from events
- `client/src/hooks/usePendingApprovals/usePendingApprovals.test.ts`: tracks/clears approvals
- Update existing: SessionDetailPage, ToolCallCard, SessionTable tests

### Unit Tests: acp-client
- `acp-client/src/tui/sse-listener.test.ts`: mock EventSource, verify dispatch
- `acp-client/src/tui/approval-resolver.test.ts`: TUI wins, SSE wins, race behavior
- `acp-client/src/tui/cherrypick.test.ts`: mock adapter, verify save/prune/load flow

### Unit Tests: server
- `server/src/routes/commands/commands.test.ts`: command endpoint
- Update existing: events, sessions tests

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| `/chat save` and `/chat load` don't work via `_kiro.dev/commands/execute` | Cherrypick flow breaks | Test early in step 7. Fallback: manual paste flow (show command to user) |
| SSE reconnection storms when server restarts | ACP client floods server | Exponential backoff with jitter, max 30s between retries |
| Dual-input approval race condition | Double approval or missed approval | Use a single-resolve promise pattern. First response wins, second is no-op |
| react-markdown bundle size | Slow client load | Lazy-load MarkdownRenderer with React.lazy. Only loaded on session detail page |
| Large assistant responses slow rendering | UI jank | Virtualize long responses or cap rendered length with "show more" |
| Schema migration on large DBs | Slow startup | ALTER TABLE ADD COLUMN is O(1) in SQLite (no table rewrite) |

## Dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| `react-markdown` | npm (client) | Markdown to React rendering |
| `remark-gfm` | npm (client) | GitHub-flavored markdown support |
| `react-syntax-highlighter` | npm (client) | Code block syntax highlighting |
| `@types/react-syntax-highlighter` | npm (client, dev) | TypeScript types |
