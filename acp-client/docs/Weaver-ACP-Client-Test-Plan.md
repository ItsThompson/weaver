# Weaver ACP Client: QA Test Plan

## Overview

Manual QA test plan for the `acp-client` package — a custom ACP client that replaces `kiro-cli chat` as the terminal interface, with SQLite as the shared storage layer.

Scope: all user-facing behavior introduced by the `acp-client` branch, plus regression coverage for the server refactor (JSONL → SQLite) and hook handler simplification.

## Environment Setup

### Prerequisites

- Node.js 20+
- macOS
- `kiro-cli` installed and on PATH (binary: `kiro-cli-chat`)
- `$EDITOR` set (e.g., `vim`, `nano`, `code --wait`)
- `sqlite3` CLI available (for inspecting DB state)

### Build & Install

```bash
cd ~/Documents/weaver
npm install
turbo build
```

### Verify Unit Tests Pass

```bash
turbo test
# Expected: 352 tests pass across all packages
```

### Start Services

```bash
# Terminal 1: weaver server + client (dev mode)
npm run dev
# Server: http://localhost:8143
# Client: http://localhost:5173

# Terminal 2: test terminal for weaver chat
```

### Inspect SQLite

```bash
sqlite3 ~/.weaver/weaver.sqlite3
# Useful queries:
#   SELECT id, status, cwd, created_at FROM sessions ORDER BY created_at DESC;
#   SELECT role, type, substr(content, 1, 80) FROM messages WHERE session_id = '<id>';
#   SELECT tool_name, status, kind FROM tool_calls WHERE session_id = '<id>';
#   SELECT event_type, created_at FROM events WHERE session_id = '<id>';
```

### Clean State (optional)

```bash
rm -f ~/.weaver/weaver.sqlite3
# DB is recreated on next `weaver chat` launch
```

---

## Test Cases

### 1. Connection & Startup

#### TC-1.1: Launch new session [P0]

**Steps:**
1. Run `weaver chat`

**Expected:**
- TUI launches without errors
- System message appears: `Session started (<8-char ID>)`
- Prompt `weaver> ` is displayed
- `~/.weaver/weaver.sqlite3` exists
- `sqlite3 ~/.weaver/weaver.sqlite3 "SELECT count(*) FROM sessions WHERE status='open'"` returns ≥ 1
- `~/.weaver/acp-client.log` exists (agent stderr log)

#### TC-1.2: Launch with custom cwd [P1]

**Steps:**
1. Run `weaver chat --cwd /tmp`

**Expected:**
- Session starts successfully
- `SELECT cwd FROM sessions ORDER BY created_at DESC LIMIT 1` returns `/tmp`

#### TC-1.3: Launch with missing agent binary [P1]

**Steps:**
1. Run `weaver chat --agent nonexistent-binary`

**Expected:**
- Process exits with a fatal error logged to stderr
- Error is structured JSON with `event: "fatal"`

#### TC-1.4: Help text includes chat command [P2]

**Steps:**
1. Run `weaver --help`

**Expected:**
- Output includes `chat` command with description

---

### 2. Prompt & Response

#### TC-2.1: Send a simple prompt [P0]

**Steps:**
1. Run `weaver chat`
2. Type `What is 2 + 2?` and press Enter

**Expected:**
- Input is accepted, prompt disappears during processing
- Response streams to terminal in real-time (character by character, not all at once)
- After response completes, `weaver> ` prompt reappears
- `SELECT content FROM messages WHERE session_id = '<id>' AND role = 'user'` contains the prompt text
- `SELECT content FROM messages WHERE session_id = '<id>' AND role = 'assistant'` contains the response

#### TC-2.2: Multi-line input with ctrl+j [P1]

**Steps:**
1. Run `weaver chat`
2. Type `line one`
3. Press ctrl+j
4. Type `line two`
5. Press Enter

**Expected:**
- After ctrl+j, a `... ` continuation prompt appears
- Both lines are sent as a single prompt
- `SELECT content FROM messages WHERE role = 'user' ORDER BY created_at DESC LIMIT 1` contains `line one\nline two`

#### TC-2.3: Empty input is ignored [P2]

**Steps:**
1. Run `weaver chat`
2. Press Enter with no text

**Expected:**
- No prompt is sent to the agent
- No new message rows in SQLite
- Prompt reappears immediately

#### TC-2.4: Prompt that triggers tool use [P0]

**Steps:**
1. Run `weaver chat` in a project directory
2. Type a prompt that triggers a tool call (e.g., `Read the contents of package.json`)

**Expected:**
- Tool call announcement appears: `🔧 [pending] <tool title>`
- Permission prompt appears: `🔐 Permission requested: <title>`
- Tool kind and input preview are displayed
- `Allow? [y]es / [n]o / [t]rust always >` prompt appears

#### TC-2.5: Input paused during agent response [P1]

**Steps:**
1. Run `weaver chat`
2. Send a prompt that produces a long response
3. While response is streaming, type characters

**Expected:**
- Typed characters do not appear in the terminal during streaming
- After response completes, prompt reappears and input is accepted again

---

### 3. Tool Approval

#### TC-3.1: Approve tool call with 'y' [P0]

**Steps:**
1. Trigger a tool call (see TC-2.4)
2. Type `y` and press Enter

**Expected:**
- Tool executes
- Tool call status updates appear (⚙️ in_progress → ✅ completed)
- Agent continues with the tool result
- `SELECT status, permission_response FROM tool_calls WHERE session_id = '<id>' ORDER BY started_at DESC LIMIT 1` shows `completed` / `allow_once`

#### TC-3.2: Reject tool call with 'n' [P0]

**Steps:**
1. Trigger a tool call
2. Type `n` and press Enter

**Expected:**
- Tool is not executed
- Agent acknowledges the rejection and continues
- `SELECT permission_response FROM tool_calls WHERE session_id = '<id>' ORDER BY started_at DESC LIMIT 1` shows `reject_once`

#### TC-3.3: Trust always with 't' [P0]

**Steps:**
1. Trigger a tool call
2. Type `t` and press Enter
3. Continue the conversation to trigger another call to the same tool

**Expected:**
- First tool executes after `t`
- Subsequent calls to the same tool are auto-approved (no prompt)
- `SELECT permission_response FROM tool_calls ORDER BY started_at DESC LIMIT 1` shows `allow_always`

#### TC-3.4: Invalid approval input [P2]

**Steps:**
1. Trigger a tool call
2. Type `x` and press Enter

**Expected:**
- Treated as cancelled
- Agent receives a cancellation response

#### TC-3.5: Tool call input preview truncation [P2]

**Steps:**
1. Trigger a tool call with a large input (e.g., a file write with many lines)

**Expected:**
- Input preview shows at most 5 lines followed by `...`
- Full input is still stored in SQLite (`SELECT input FROM tool_calls`)

---

### 4. Slash Commands — Local

#### TC-4.1: /help [P1]

**Steps:**
1. Run `weaver chat`
2. Type `/help`

**Expected:**
- Lists all registered commands with descriptions
- Includes local commands: `/quit`, `/editor`, `/reply`, `/clear`, `/help`
- Includes forwarded commands: `/compact`, `/tools`, `/model`, `/context`, `/mcp`, `/usage`, `/agent`, `/chat`, `/prompts`, `/plan`, `/todos`, `/hooks`
- Shortcuts shown where applicable (e.g., `/editor (ctrl+e)`)

#### TC-4.2: /editor [P0]

**Steps:**
1. Run `weaver chat`
2. Type `/editor`
3. In the editor, type a prompt and save/quit

**Expected:**
- `$EDITOR` opens with an empty `prompt.md` temp file
- After saving and closing, the content is sent as a prompt
- Agent responds normally
- Temp file is cleaned up

#### TC-4.3: /editor with empty save [P2]

**Steps:**
1. Type `/editor`
2. Save the file without adding content, then quit

**Expected:**
- No prompt is sent
- Prompt reappears

#### TC-4.4: ctrl+e shortcut [P1]

**Steps:**
1. Press ctrl+e

**Expected:**
- Same behavior as `/editor` — opens `$EDITOR`

#### TC-4.5: /reply [P0]

**Steps:**
1. Send a prompt and receive a response
2. Type `/reply`

**Expected:**
- `$EDITOR` opens with the last assistant message quoted (each line prefixed with `> `)
- Two blank lines appended after the quote for the user to type
- After editing and saving, the full content (quote + new text) is sent as a prompt

#### TC-4.6: /reply N [P1]

**Steps:**
1. Send 3 prompts and receive 3 responses
2. Type `/reply 3`

**Expected:**
- `$EDITOR` opens with all 3 assistant messages quoted, separated by blank lines
- Each message's lines are prefixed with `> `

#### TC-4.7: ctrl+r shortcut [P1]

**Steps:**
1. Send a prompt and receive a response
2. Press ctrl+r

**Expected:**
- Same behavior as `/reply` — opens `$EDITOR` with quoted last message

#### TC-4.8: /clear [P1]

**Steps:**
1. Send a few prompts
2. Type `/clear`

**Expected:**
- Terminal screen is cleared
- Command is also forwarded to the agent (agent context cleared)

#### TC-4.9: /quit [P1]

**Steps:**
1. Type `/quit`

**Expected:**
- Process exits cleanly
- `SELECT status FROM sessions WHERE id = '<id>'` shows `closed`

#### TC-4.10: Unregistered command [P2]

**Steps:**
1. Type `/nonexistent`

**Expected:**
- Not treated as a command (returns false from handleInput)
- Sent as a regular prompt to the agent (text: `/nonexistent`)

---

### 5. Slash Commands — Forwarded

#### TC-5.1: /model [P1]

**Steps:**
1. Type `/model`

**Expected:**
- Command is forwarded to the agent via `_kiro.dev/commands/execute`
- Agent responds with current model info

#### TC-5.2: /model with args [P1]

**Steps:**
1. Type `/model claude-sonnet-4-20250514`

**Expected:**
- Command forwarded as `/model claude-sonnet-4-20250514`
- Agent acknowledges model change

#### TC-5.3: /compact [P1]

**Steps:**
1. Have a long conversation
2. Type `/compact`

**Expected:**
- Command forwarded to agent
- Compaction status displayed as system message (dim text)

#### TC-5.4: All 12 forwarded commands exist [P2]

**Steps:**
1. Type `/help`

**Expected:**
- All 12 forwarded commands listed: `compact`, `tools`, `model`, `context`, `mcp`, `usage`, `agent`, `chat`, `prompts`, `plan`, `todos`, `hooks`

---

### 6. Shutdown & Process Management

#### TC-6.1: ctrl+c double-tap quit [P0]

**Steps:**
1. Press ctrl+c once

**Expected:**
- Warning message: `(Press Ctrl+C again to quit)`
- Prompt reappears

2. Press ctrl+c again within 2 seconds

**Expected:**
- Process exits cleanly
- Session marked closed in SQLite
- `kiro-cli acp` child process is terminated (verify with `ps aux | grep kiro`)

#### TC-6.2: ctrl+c single tap does not quit [P1]

**Steps:**
1. Press ctrl+c once
2. Wait 3 seconds
3. Press ctrl+c once

**Expected:**
- Warning appears both times
- Process does NOT quit (2-second window expired)

#### TC-6.3: ctrl+c during active prompt [P1]

**Steps:**
1. Send a prompt that triggers a long response
2. Press ctrl+c twice quickly during streaming

**Expected:**
- In-progress prompt is cancelled
- Process exits cleanly
- No orphan `kiro-cli` processes

#### TC-6.4: Agent process crash [P1]

**Steps:**
1. Run `weaver chat`
2. Find the kiro-cli child PID: `pgrep -f "kiro-cli-chat acp"`
3. Kill it: `kill -9 <pid>`

**Expected:**
- TUI shows an error or exits
- No zombie processes remain
- Session can be inspected in SQLite (status may still show 'open' — server PID polling will clean it up)

---

### 7. Session Resume

#### TC-7.1: Resume a session [P0]

**Steps:**
1. Run `weaver chat`, send a prompt, receive a response
2. Note the session ID from the startup message
3. Quit with `/quit`
4. Get the full session ID: `sqlite3 ~/.weaver/weaver.sqlite3 "SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1"`
5. Run `weaver chat --resume <full-session-id>`

**Expected:**
- System message: `Resuming session <8-char>...`
- Conversation history is replayed (previous messages appear)
- System message: `Session loaded.`
- User can send new prompts and continue the conversation

#### TC-7.2: Resume nonexistent session [P1]

**Steps:**
1. Run `weaver chat --resume nonexistent-id`

**Expected:**
- Error message: `Session not found: nonexistent-id`
- Process exits cleanly

#### TC-7.3: Resume and verify SQLite continuity [P1]

**Steps:**
1. Create a session, send 2 prompts, quit
2. Resume the session, send 1 more prompt, quit
3. Query messages: `SELECT count(*) FROM messages WHERE session_id = '<id>'`

**Expected:**
- All messages from both the original and resumed session are present
- Messages are ordered chronologically

---

### 8. SQLite Persistence

#### TC-8.1: Session created in DB [P0]

**Steps:**
1. Run `weaver chat`
2. Query: `SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1`

**Expected:**
- Row exists with: `status = 'open'`, `agent_name = 'kiro'`, `cwd` matches working directory, `pid` is set, `agent_session_id` is set

#### TC-8.2: Messages persisted [P0]

**Steps:**
1. Send a prompt and receive a response
2. Query: `SELECT role, type, substr(content, 1, 100) FROM messages WHERE session_id = '<id>' ORDER BY created_at`

**Expected:**
- At least 2 rows: one `user`/`text` and one `assistant`/`text`
- Content matches what was displayed in the TUI

#### TC-8.3: Tool calls persisted [P0]

**Steps:**
1. Trigger and approve a tool call
2. Query: `SELECT tool_name, status, kind, permission_response FROM tool_calls WHERE session_id = '<id>'`

**Expected:**
- Row exists with `status = 'completed'`, `permission_response = 'allow_once'`
- `input` and `output` fields contain JSON

#### TC-8.4: Events persisted [P1]

**Steps:**
1. Send a prompt and receive a response
2. Query: `SELECT event_type, created_at FROM events WHERE session_id = '<id>' ORDER BY created_at`

**Expected:**
- Events include: `session_start`, `prompt`, `turn_end`
- Timestamps are chronologically ordered

#### TC-8.5: Context usage tracked [P1]

**Steps:**
1. Send several prompts
2. Query: `SELECT context_usage_percent FROM sessions WHERE id = '<id>'`

**Expected:**
- Value is non-null and between 0 and 100
- Value increases as conversation grows

#### TC-8.6: Session title auto-set [P2]

**Steps:**
1. Send a prompt (agent may set a session title via `session_info_update`)
2. Query: `SELECT custom_name FROM sessions WHERE id = '<id>'`

**Expected:**
- If the agent sent a title, `custom_name` is populated

#### TC-8.7: Cascade delete [P1]

**Steps:**
1. Create a session with messages and tool calls
2. Delete via API: `curl -X DELETE http://localhost:8143/api/sessions/<id>`
3. Query: `SELECT count(*) FROM messages WHERE session_id = '<id>'`

**Expected:**
- Session row deleted
- All related messages, tool_calls, and events deleted (cascade)

#### TC-8.8: Concurrent sessions [P0]

**Steps:**
1. Open Terminal A: `weaver chat`
2. Open Terminal B: `weaver chat`
3. Send a prompt in Terminal A
4. Send a prompt in Terminal B
5. Query: `SELECT id, status FROM sessions WHERE status = 'open'`

**Expected:**
- Two distinct open sessions
- No SQLITE_BUSY errors in either terminal
- Both sessions have their own messages (no cross-contamination)

#### TC-8.9: WAL mode enabled [P2]

**Steps:**
1. Run: `sqlite3 ~/.weaver/weaver.sqlite3 "PRAGMA journal_mode"`

**Expected:**
- Returns `wal`

#### TC-8.10: DB created from scratch [P1]

**Steps:**
1. `rm -f ~/.weaver/weaver.sqlite3`
2. Run `weaver chat`

**Expected:**
- DB file recreated
- Schema applied (all tables exist)
- `SELECT version FROM schema_version` returns `1`

---

### 9. Dashboard Integration

#### TC-9.1: Sessions list shows ACP sessions [P0]

**Steps:**
1. Run `weaver chat`, send a prompt
2. Open dashboard: http://localhost:5173
3. Navigate to sessions list

**Expected:**
- Session appears in the list
- Shows working directory, status (open/closed), creation time
- If agent set a title, it appears as the session name

#### TC-9.2: Session detail shows messages [P0]

**Steps:**
1. Click on a session in the dashboard

**Expected:**
- Conversation turns are displayed
- User prompts and assistant responses are visible
- Tool calls shown with name, status, and I/O details

#### TC-9.3: Session detail shows tool call details [P1]

**Steps:**
1. Open a session that had tool calls

**Expected:**
- Tool calls display: tool name, kind, status, input, output
- Completed tool calls show both input and output

#### TC-9.4: Rename session via dashboard [P1]

**Steps:**
1. Rename a session in the dashboard UI
2. Query: `SELECT custom_name FROM sessions WHERE id = '<id>'`

**Expected:**
- Name updated in SQLite
- Dashboard reflects the new name

#### TC-9.5: Delete session via dashboard [P1]

**Steps:**
1. Delete a session in the dashboard UI
2. Query: `SELECT count(*) FROM sessions WHERE id = '<id>'`

**Expected:**
- Session and all related data removed from SQLite
- Session disappears from the dashboard list

#### TC-9.6: SSE live updates [P1]

**Steps:**
1. Open the dashboard to a session detail page
2. In the terminal, send a prompt in that session

**Expected:**
- Dashboard updates in real-time (new messages appear without page refresh)
- Server received the notify POST from the ACP client

#### TC-9.7: Stale session cleanup [P2]

**Steps:**
1. Run `weaver chat`, note the session
2. Kill the terminal (not graceful quit — close the terminal window)
3. Wait for the server's PID polling interval
4. Check dashboard

**Expected:**
- Session eventually marked as closed (server detects dead PID)

---

### 10. MCP Config

#### TC-10.1: Global MCP config passthrough [P1]

**Steps:**
1. Create `~/.kiro/settings/mcp.json`:
   ```json
   { "mcpServers": { "test-server": { "command": "echo", "args": ["hello"] } } }
   ```
2. Run `weaver chat`

**Expected:**
- No errors on startup
- MCP server config is passed to the agent on session creation
- If the MCP server is valid, agent reports it as initialized

#### TC-10.2: Workspace MCP config overrides global [P2]

**Steps:**
1. Set up global config with server `foo`
2. Create `.kiro/settings/mcp.json` in the working directory with a different `foo` config
3. Run `weaver chat`

**Expected:**
- Workspace config takes precedence for `foo`
- Global-only servers are still included

#### TC-10.3: Missing MCP config files [P2]

**Steps:**
1. Ensure no MCP config files exist
2. Run `weaver chat`

**Expected:**
- Starts normally with empty MCP servers list
- No errors

---

### 11. $EDITOR Integration

#### TC-11.1: $EDITOR with vim [P1]

**Steps:**
1. `export EDITOR=vim`
2. Run `weaver chat`
3. Type `/editor`

**Expected:**
- vim opens with a temp `prompt.md` file
- After writing content and `:wq`, content is sent as prompt

#### TC-11.2: $EDITOR with VS Code [P2]

**Steps:**
1. `export EDITOR="code --wait"`
2. Type `/editor`

**Expected:**
- VS Code opens the temp file
- After saving and closing the tab, content is sent as prompt
- Editor command with arguments is correctly split

#### TC-11.3: $EDITOR not set [P2]

**Steps:**
1. `unset EDITOR`
2. Type `/editor`

**Expected:**
- Falls back to `vi`
- Editor opens normally

#### TC-11.4: Editor exits with non-zero code [P2]

**Steps:**
1. Set `$EDITOR` to a script that exits with code 1
2. Type `/editor`

**Expected:**
- Error is shown in the TUI
- No prompt is sent

---

### 12. Hook Handler

#### TC-12.1: Marker file created [P1]

**Steps:**
1. Run `kiro-cli chat` (not `weaver chat` — direct kiro)
2. Check: `ls ~/.weaver/.current-session-*`

**Expected:**
- A `.current-session-<pid>` file exists
- File contains the PID number

#### TC-12.2: No JSONL files created [P1]

**Steps:**
1. Run `kiro-cli chat`, send a prompt
2. Check: `ls ~/.weaver/logs/`

**Expected:**
- No new `.jsonl` files created by the hook
- `~/.weaver/sessions.jsonl` is NOT written to

#### TC-12.3: Server notified [P2]

**Steps:**
1. Run `kiro-cli chat` with the weaver server running
2. Check server logs for incoming POST to `/api/notify`

**Expected:**
- Notify calls received with `sessionId: "hook-<pid>"`

---

### 13. CLI Wiring

#### TC-13.1: weaver chat delegates to acp-client [P0]

**Steps:**
1. Run `weaver chat`

**Expected:**
- ACP client TUI launches (not the old kiro-cli chat)
- System message confirms session started

#### TC-13.2: weaver chat --resume passes through [P1]

**Steps:**
1. Run `weaver chat --resume <id>`

**Expected:**
- `--resume` flag is passed to the acp-client entry point
- Session resume behavior works (or appropriate error if ID invalid)

#### TC-13.3: Existing commands unaffected [P0]

**Steps:**
1. Run `weaver view`
2. Run `weaver session`
3. Run `weaver session list`

**Expected:**
- All existing commands work as before
- No regressions from the `chat` command addition

---

### 14. Server API Regression

#### TC-14.1: GET /api/sessions [P0]

**Steps:**
1. `curl http://localhost:8143/api/sessions`

**Expected:**
- Returns JSON array of sessions
- Each session has: `id`, `status`, `cwd`, `createdAt`, `name`
- Sessions created by `weaver chat` appear in the list

#### TC-14.2: GET /api/sessions/:id [P0]

**Steps:**
1. `curl http://localhost:8143/api/sessions/<id>`

**Expected:**
- Returns session detail with `turns` array
- Turns contain assistant message content and tool call details
- `toolCallDetails` includes `toolName`, `status`, `input`, `output`

#### TC-14.3: PATCH /api/sessions/:id [P1]

**Steps:**
1. `curl -X PATCH http://localhost:8143/api/sessions/<id> -H 'Content-Type: application/json' -d '{"name":"test-rename"}'`

**Expected:**
- Returns success
- `SELECT custom_name FROM sessions WHERE id = '<id>'` returns `test-rename`

#### TC-14.4: DELETE /api/sessions/:id [P1]

**Steps:**
1. `curl -X DELETE http://localhost:8143/api/sessions/<id>`

**Expected:**
- Returns success
- Session and all related data removed from SQLite

#### TC-14.5: POST /api/notify [P1]

**Steps:**
1. `curl -X POST http://localhost:8143/api/notify -H 'Content-Type: application/json' -d '{"sessionId":"test","eventName":"test"}'`

**Expected:**
- Returns success
- SSE clients receive the broadcast

#### TC-14.6: GET /api/health [P2]

**Steps:**
1. `curl http://localhost:8143/api/health`

**Expected:**
- Returns 200 OK

---

### 15. Electron App

#### TC-15.1: Electron app launches with SQLite backend [P1]

**Steps:**
1. `npm run app`

**Expected:**
- Electron app launches
- Dashboard loads and displays sessions from SQLite
- F5 hotkey toggles the window
- Tray icon works

#### TC-15.2: Packaged app works [P2]

**Steps:**
1. `npm run dist`
2. Open the generated `.app`

**Expected:**
- App launches without `better-sqlite3` native module errors
- Dashboard functions correctly

---

### 16. Edge Cases

#### TC-16.1: Very long prompt [P2]

**Steps:**
1. Use `/editor` to compose a prompt with 1000+ lines
2. Submit

**Expected:**
- Prompt is sent successfully
- No truncation or errors
- Full content stored in SQLite

#### TC-16.2: Rapid successive prompts [P2]

**Steps:**
1. Send a prompt
2. Immediately after response, send another prompt
3. Repeat 5 times quickly

**Expected:**
- Each prompt/response cycle completes correctly
- No race conditions or duplicate messages in SQLite
- Input correctly paused/resumed between turns

#### TC-16.3: Special characters in prompt [P2]

**Steps:**
1. Send a prompt containing: backticks, quotes, newlines, unicode, emoji

**Expected:**
- Characters preserved in the prompt and stored correctly in SQLite
- Agent receives the full content

#### TC-16.4: Session with no tool calls [P2]

**Steps:**
1. Send a simple factual question (no tool use expected)
2. Check dashboard

**Expected:**
- Session displays correctly with message turns only
- No errors from empty tool_calls query

#### TC-16.5: Network down — server notify fails gracefully [P2]

**Steps:**
1. Stop the weaver server
2. Run `weaver chat` and send prompts

**Expected:**
- TUI works normally (server notify is fire-and-forget)
- No errors displayed to the user
- Data still persisted to SQLite
- When server restarts, dashboard shows the session data from SQLite

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 16 | Must pass — core functionality is broken if these fail |
| P1 | 27 | High — important features, should pass before merge |
| P2 | 20 | Medium — edge cases and polish, can follow up |

## Out of Scope

- Image support in prompts (not implemented)
- Context tree UX
- Linux compatibility
- Performance benchmarking
- Security audit of SQLite access patterns
