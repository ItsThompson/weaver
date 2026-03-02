# Weaver — Project Context & Reference

## Project Description

Weaver provides tooling that builds on top of kiro-cli to add additional features for the user in order to make it easier to manage conversations, branching logic, and validation in a more efficient way. The main focus is on providing tools that allow users to have better observability into their conversations, the ability to cherrypick parts of the conversation, and validation hooks that can be used to ensure that the conversation is following certain rules or guidelines.

## High Level Objectives

- **Observability**: View conversation, branching logic for tangents by adding hooks at the agent level which runs a script that logs the conversation and branching logic to a file.
- **Cherrypick**: Choose parts of the conversation to hide/remove and reload context (`/chat save` or `/chat save-via-script` to export to file, `/chat load` or `/chat load-via-script` to restore session)

## Technologies

- Full typescript app, React FE, Node TypeScript BE.

## Flow 1: Observability

1. User initiates a conversation with the agent. The agent config contains hooks (https://kiro.dev/docs/cli/hooks/) which trigger a script that logs the conversation.
2. Weaver will have a dashboard that contains all the conversations that have been logged distinguished via time, pwd, and agent. Weaver will store a custom name for the conversation that the user will manually set which creates an additional layer of observability and organization for the user.
3. The user can click into a conversation to view the transcript and branching logic in a more visual way than just looking at the raw JSON file. This will allow the user to easily see how the conversation flowed and where any tangents occurred.

## Resources

- https://kiro.dev/docs/cli/ (Heavily reference this resource for building out the features of this project, as it provides the core functionality that we will be building on top of)

---

## Kiro CLI Hooks Reference

Hooks allow you to execute custom commands at specific points during agent lifecycle and tool execution. They are defined in the agent configuration JSON file.

### Hook Event (STDIN)

All hooks receive JSON via STDIN with at minimum:
```json
{
  "hook_event_name": "<hookType>",
  "cwd": "/current/working/directory"
}
```

Tool-related hooks additionally include:
- `tool_name`: Name of the tool being executed
- `tool_input`: Tool-specific parameters
- `tool_response`: Tool execution results (PostToolUse only)

### Hook Output / Exit Codes

- **Exit 0**: Hook succeeded. STDOUT captured (added to context for agentSpawn/userPromptSubmit).
- **Exit 2**: (PreToolUse only) Block tool execution. STDERR returned to LLM.
- **Other**: Hook failed. STDERR shown as warning.

### Hook Types & Available Data

#### 1. AgentSpawn
Fires when agent is activated (once per session).

Data available:
```json
{
  "hook_event_name": "agentSpawn",
  "cwd": "/current/working/directory"
}
```

#### 2. UserPromptSubmit
Fires when user submits a prompt. STDOUT added to conversation context.

Data available:
```json
{
  "hook_event_name": "userPromptSubmit",
  "cwd": "/current/working/directory",
  "prompt": "user's input prompt"
}
```

#### 3. PreToolUse
Fires before tool execution. Can block tool usage (exit 2).

Data available:
```json
{
  "hook_event_name": "preToolUse",
  "cwd": "/current/working/directory",
  "tool_name": "fs_read",
  "tool_input": { /* tool-specific params */ }
}
```

#### 4. PostToolUse
Fires after tool execution with full results.

Data available:
```json
{
  "hook_event_name": "postToolUse",
  "cwd": "/current/working/directory",
  "tool_name": "fs_read",
  "tool_input": { /* tool-specific params */ },
  "tool_response": {
    "success": true,
    "result": [ /* tool output */ ]
  }
}
```

#### 5. Stop
Fires when assistant finishes responding (end of each turn). No matcher support.

Data available:
```json
{
  "hook_event_name": "stop",
  "cwd": "/current/working/directory"
}
```

#### 6. MCP Tools
MCP tools use the same PreToolUse/PostToolUse hooks but with namespaced tool names:
```json
{
  "hook_event_name": "preToolUse",
  "tool_name": "@sequential-thinking/sequentialthinking",
  "tool_input": { /* MCP tool params */ }
}
```

### Tool Matching (for PreToolUse/PostToolUse)

- `"fs_write"` or `"write"` — exact match / alias
- `"@git"` — all tools from git MCP server
- `"@git/status"` — specific MCP tool
- `"*"` — all tools (built-in and MCP)
- `"@builtin"` — all built-in tools only
- No matcher — applies to all tools

### Hook Configuration Fields

- `command` (required): Command to execute
- `matcher` (optional): Tool pattern for preToolUse/postToolUse
- `description` (optional): Human-readable description
- `timeout_ms` (optional): Timeout in ms (default 30000)
- `cache_ttl_seconds` (optional): Cache duration (0 = no cache, agentSpawn never cached)

---

## Agent Configuration with All Hooks

This is the current agent config at `~/.config/amazonq/global/agents/test-dev.json`:

```json
{
  "hooks": {
    "agentSpawn": [
      {
        "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
        "description": "Weaver: log agent spawn event (cwd)"
      }
    ],
    "userPromptSubmit": [
      {
        "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
        "description": "Weaver: log user prompt submission (cwd, prompt)"
      }
    ],
    "preToolUse": [
      {
        "matcher": "*",
        "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
        "description": "Weaver: log pre-tool-use for all tools (cwd, tool_name, tool_input)"
      }
    ],
    "postToolUse": [
      {
        "matcher": "*",
        "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
        "description": "Weaver: log post-tool-use for all tools (cwd, tool_name, tool_input, tool_response)"
      }
    ],
    "stop": [
      {
        "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
        "description": "Weaver: log turn completion (cwd)"
      }
    ]
  }
}
```

### Hook Logging Script

Located at `~/.config/amazonq/global/hooks/weaver-log.sh`:

```bash
#!/bin/bash
LOG_DIR="$HOME/.config/amazonq/global/hooks/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/weaver-$(date +%Y-%m-%d).jsonl"

EVENT=$(cat)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

echo "{\"timestamp\":\"$TIMESTAMP\",\"event\":$EVENT}" >> "$LOG_FILE"
```

---

## Real Hook Log Output

This is actual captured output from a test conversation (JSONL format, one event per line). Log file: `~/.config/amazonq/global/hooks/logs/weaver-2026-03-02.jsonl`

```jsonl
{"timestamp":"2026-03-02T11:30:25.3NZ","event":{"hook_event_name":"agentSpawn","cwd":"/Users/thompsnt/Documents/weaver"}}
{"timestamp":"2026-03-02T11:30:26.3NZ","event":{"hook_event_name":"userPromptSubmit","cwd":"/Users/thompsnt/Documents/weaver","prompt":"Use the sequential-thinking MCP tool to think through how to reverse a linked list, then read ~/.config/amazonq/global/agents/test-dev.json, create /tmp/weaver-test.txt with \"hook test\", and run `echo \"done\"` in bash\n"}}
{"timestamp":"2026-03-02T11:30:34.3NZ","event":{"hook_event_name":"preToolUse","cwd":"/Users/thompsnt/Documents/weaver","tool_name":"@sequential-thinking/sequentialthinking","tool_input":{"thought":"Let me think through reversing a linked list...","nextThoughtNeeded":true,"thoughtNumber":1,"totalThoughts":3}}}
{"timestamp":"2026-03-02T11:30:34.3NZ","event":{"hook_event_name":"preToolUse","cwd":"/Users/thompsnt/Documents/weaver","tool_name":"fs_read","tool_input":{"operations":[{"mode":"Line","path":"~/.config/amazonq/global/agents/test-dev.json"}]}}}
{"timestamp":"2026-03-02T11:30:34.3NZ","event":{"hook_event_name":"preToolUse","cwd":"/Users/thompsnt/Documents/weaver","tool_name":"fs_write","tool_input":{"command":"create","path":"/tmp/weaver-test.txt","file_text":"hook test\n"}}}
{"timestamp":"2026-03-02T11:30:34.3NZ","event":{"hook_event_name":"preToolUse","cwd":"/Users/thompsnt/Documents/weaver","tool_name":"execute_bash","tool_input":{"command":"echo \"done\""}}}
{"timestamp":"2026-03-02T11:30:39.3NZ","event":{"hook_event_name":"postToolUse","cwd":"/Users/thompsnt/Documents/weaver","tool_name":"@sequential-thinking/sequentialthinking","tool_input":{"thought":"Let me think through reversing a linked list...","nextThoughtNeeded":true,"thoughtNumber":1,"totalThoughts":3},"tool_response":{"success":true,"result":[{"content":[{"type":"text","text":"{...}"}],"structuredContent":{"thoughtNumber":1,"totalThoughts":3,"nextThoughtNeeded":true,"branches":[],"thoughtHistoryLength":1}}]}}}
{"timestamp":"2026-03-02T11:30:39.3NZ","event":{"hook_event_name":"postToolUse","cwd":"/Users/thompsnt/Documents/weaver","tool_name":"fs_read","tool_input":{"operations":[{"mode":"Line","path":"~/.config/amazonq/global/agents/test-dev.json"}]},"tool_response":{"success":true,"result":["<file contents>"]}}}
{"timestamp":"2026-03-02T11:30:39.3NZ","event":{"hook_event_name":"postToolUse","cwd":"/Users/thompsnt/Documents/weaver","tool_name":"fs_write","tool_input":{"command":"create","path":"/tmp/weaver-test.txt","file_text":"hook test\n"},"tool_response":{"success":true,"result":[""]}}}
{"timestamp":"2026-03-02T11:30:40.3NZ","event":{"hook_event_name":"postToolUse","cwd":"/Users/thompsnt/Documents/weaver","tool_name":"execute_bash","tool_input":{"command":"echo \"done\""},"tool_response":{"success":true,"result":[{"exit_status":"0","stdout":"done\n","stderr":""}]}}}
{"timestamp":"2026-03-02T11:31:03.3NZ","event":{"hook_event_name":"stop","cwd":"/Users/thompsnt/Documents/weaver"}}
```

### Key Observations from Hook Logs

1. **agentSpawn** fires once at session start — only provides `cwd`. Good for session boundary markers.
2. **userPromptSubmit** captures the full user prompt text — essential for conversation logging.
3. **preToolUse** fires for ALL tools including MCP (`@sequential-thinking/sequentialthinking`). Multiple preToolUse events can fire at the same timestamp when the agent calls tools in parallel.
4. **postToolUse** includes `tool_response` with full results — can be very large (entire file contents). Will need truncation/summarization for the dashboard.
5. **stop** fires once at end of turn — only provides `cwd`. Good for turn boundary markers.
6. **Missing data**: The assistant's final text response is NOT captured by any hook. It must be reconstructed from the sequence of tool interactions, or obtained via `/chat save`.

---

## /chat save Output Format

The `/chat save` command exports the full conversation state as JSON. Two example files demonstrate the difference between saving inside vs outside a tangent.

### Key Structure

```typescript
interface SavedConversation {
  conversation_id: string;
  next_message: null;
  history: ConversationTurn[];      // Array of user/assistant turn pairs
  valid_history_range: [number, number];
  transcript: string[];             // Human-readable summary of conversation
  tools: Record<string, ToolSpec[]>; // Available tools (native + MCP)
  context_manager: {
    max_context_files_size: number;
    current_profile: string;
    paths: string[];
    hooks: {};
  };
  context_message_length: number;
  model_info: ModelInfo;
  tangent_state?: TangentState;     // Only present when saved inside a tangent
  // ... other metadata
}
```

### ConversationTurn Structure

Each turn in `history` contains:

```typescript
interface ConversationTurn {
  user: {
    additional_context: string;
    env_context: { env_state: { operating_system, current_working_directory, environment_variables } };
    content: { Prompt: { prompt: string } } | { ToolUseResults: { tool_use_results: ToolResult[] } };
    timestamp: string;
    images: null;
  };
  assistant: {
    Response: { message_id: string; content: string; }
  } | {
    ToolUse: { message_id: string; content: string; tool_uses: ToolUseCall[]; }
  };
  request_metadata: {
    request_id: string;
    context_usage_percentage: number;
    message_id: string;
    request_start_timestamp_ms: number;
    stream_end_timestamp_ms: number;
    user_prompt_length: number;
    response_size: number;
    chat_conversation_type: "NotToolUse" | "ToolUse";
    tool_use_ids_and_names: [string, string][];
    model_id: string;
  };
}
```

### Transcript Array

The `transcript` array is a human-readable summary:
- User messages prefixed with `"> "`
- Assistant messages include `[Tool uses: <tool_names>]` or `[Tool uses: none]`
- Tangent entry marked with `"> /tangent"`
- Save commands appear as `"> /chat save <filename>"`

### Tangent Detection

**Saved outside tangent** (`out-tangent.json`):
- `tangent_state` field is **absent**
- `transcript` contains `"> /tangent"` marker showing a tangent was entered
- The tangent conversation is NOT in the history (it was discarded when exiting)

**Saved inside tangent** (`in-tangent.json`):
- `tangent_state` field is **present** containing:
  - `main_history`: The conversation history from BEFORE entering the tangent
  - `main_transcript`: The transcript from before the tangent
  - `tangent_start_time`: Timestamp when tangent was entered
- The current `history` and `transcript` include the tangent conversation
- The tangent messages appear AFTER the `"> /tangent"` marker in the transcript

### Example Transcript (in-tangent.json)

```
[0] "> This is an example conversation..."
[1] "Got it — this conversation is a reference point... [Tool uses: none]"
[2] "> Can you please read the file..."
[3] "\n\nLet me read that file first. [Tool uses: fs_read]"
[4] "Here's what's in this file... [Tool uses: none]"
[5] "> /tangent"                                          <-- TANGENT ENTRY POINT
[6] "> This is a tangent. I would like to investigate..."
[7] "\n\nLet me read the style module... [Tool uses: fs_read]"
[8] "Two CSS module class names... [Tool uses: none]"
[9] "> /chat save in-tangent.json"
```

### Example Transcript (out-tangent.json)

```
[0] "> This is an example conversation..."
[1] "Got it — this conversation is a reference point... [Tool uses: none]"
[2] "> Can you please read the file..."
[3] "\n\nLet me read that file first. [Tool uses: fs_read]"
[4] "Here's what's in this file... [Tool uses: none]"
[5] "> /tangent"                                          <-- TANGENT ENTRY (tangent content gone)
[6] "> /chat save out-tangent.json"
```

---

## Data Gaps & Considerations for Weaver

1. **No assistant response text in hooks**: The `stop` hook doesn't include the assistant's final response. To get the full conversation including assistant text, you need `/chat save` output.

2. **Hook logs vs /chat save are complementary**:
   - Hook logs: Real-time, granular, tool-level events with timestamps
   - /chat save: Complete conversation state including assistant responses, tangent state, metadata

3. **postToolUse `tool_response` can be huge**: File reads return entire file contents. Need a strategy for storage/truncation.

4. **Parallel tool calls**: Multiple preToolUse events can share the same timestamp when the agent calls tools in parallel. This is important for visualizing branching.

5. **Tangent state is only available inside the tangent**: Once you exit a tangent, the tangent conversation is gone from `/chat save`. Hook logs would still have the events though — they persist regardless of tangent state.

6. **Session identification**: Hook logs don't include a `conversation_id` or `session_id`. You'd need to correlate via `cwd` + timestamp range, or add a session ID to the hook script.

7. **`/tangent` is NOT detectable via hooks**: `/tangent` is a client-side slash command — it does not trigger any hook type (not a tool use, not a user prompt submission, not an agent spawn or stop). There is no hook for slash command execution. The only ways to detect tangent state are:
   - From `/chat save` output: `tangent_state` field present = inside tangent; `"> /tangent"` in transcript array = tangent was entered.
   - Inferring from hook log gaps: a tangent exit discards context, so you might see a `stop` event followed by a `userPromptSubmit` where the conversation context has "reset" — but this is fragile and unreliable.
   - This is a meaningful gap for real-time observability. Weaver may need to rely on periodic `/chat save` snapshots or a future kiro-cli hook type to detect tangent transitions.

---

## Flow 2: Cherrypick (P1 — Delete Only)

### Objective

Allow users to prune irrelevant parts of a conversation and reload a cleaned-up context via `/chat load`. P1 scope is delete only — no adding or editing messages.

### User Flow

1. User runs `/chat save conversation.json` (or `/chat save-via-script`) to export current conversation state
2. User opens Weaver dashboard, imports/selects the saved JSON file
3. Weaver displays the conversation as a list of turns (user prompt → assistant response pairs)
4. User selects turns to DELETE (checkbox/toggle per turn)
5. Weaver produces a modified JSON file with selected turns removed
6. User runs `/chat load modified.json` to restore the pruned conversation

Alternative flow using scripts:
- `/chat save-via-script weaver-import.sh` — pipes JSON directly into Weaver's backend
- `/chat load-via-script weaver-export.sh` — Weaver outputs the modified JSON to stdout

### What `/chat load` Restores vs Ignores

Restores:
- ✅ Message history (the `history` array)
- ✅ Context file paths (added as temporary/session-scoped context)
- ✅ Conversation metadata

Ignores (uses current session's):
- ❌ Tool manager (recreated)
- ❌ MCP connections (reconnected)
- ❌ Model info (uses current)
- ❌ Agent config (uses current)
- ❌ Hooks (uses current)

After loading, kiro-cli auto-triggers: "In a few words, summarize our conversation so far" — so the agent re-orients itself to the loaded context.

### Conversation Structure Rules for Deletion

The `history` array contains turn pairs that follow a strict pattern. When deleting turns, these invariants must be maintained:

#### Turn Types

A "turn" in the history is a `{ user, assistant, request_metadata }` object. There are two patterns:

**Pattern A — Simple prompt/response:**
```
Turn N: user.content = { Prompt: { prompt: "..." } }
        assistant = { Response: { content: "..." } }
```

**Pattern B — Tool use (multi-turn):**
```
Turn N:   user.content = { Prompt: { prompt: "..." } }
          assistant = { ToolUse: { tool_uses: [...] } }
Turn N+1: user.content = { ToolUseResults: { tool_use_results: [...] } }
          assistant = { Response: { content: "..." } } OR { ToolUse: { ... } }
...possibly more ToolUseResults turns until a final Response
```

#### Deletion Rules

1. **The atomic deletable unit is a ConversationExchange** — the user's prompt, ALL intermediate tool use/result turns, and the final assistant response. Users cannot delete individual turns within an exchange. This is enforced at the UI level (no per-turn controls) and at the export level (exchanges are removed as a block).
2. **`valid_history_range`**: Must be updated to `[0, newHistoryLength]` after deletion.
3. **`transcript`**: Should be regenerated from the remaining history to stay consistent.
4. **`tangent_state`**: If present (saved inside tangent), the `main_history` should also be available for cherrypicking. Same exchange-level deletion rules apply.

#### Identifying Turn Groups

To present deletable units in the UI, group turns into "conversation exchanges":

```typescript
interface ConversationExchange {
  id: number;                    // Index of first turn in the exchange
  userPrompt: string;            // The user's original prompt text
  turns: ConversationTurn[];     // All turns in this exchange (1 for simple, N for tool chains)
  toolsUsed: string[];           // Tool names used (empty for simple responses)
  assistantResponse: string;     // The final assistant text response
  timestamp: string;             // From first turn's user.timestamp
}
```

Grouping logic:
1. Start a new exchange when `user.content` is `{ Prompt: {...} }`
2. Continue the exchange while subsequent turns have `user.content` as `{ ToolUseResults: {...} }`
3. The exchange ends when the assistant produces a `{ Response: {...} }` (not a `{ ToolUse: {...} }`)

#### Example: Deletable Units from in-tangent.json

```
Exchange 0: "This is an example conversation..."
  → 1 turn, no tools
  → Assistant: "Got it — this conversation is a reference point..."

Exchange 1: "Can you please read the file..."
  → 2 turns (Prompt → ToolUse[fs_read] → ToolUseResults → Response)
  → Tools: [fs_read]
  → Assistant: "Here's what's in this file regarding Pensieve metrics..."

Exchange 2: [TANGENT] "This is a tangent. I would like to investigate..."
  → 2 turns (Prompt → ToolUse[fs_read] → ToolUseResults → Response)
  → Tools: [fs_read]
  → Assistant: "Two CSS module class names are used..."
```

User sees 3 deletable exchanges. Deleting Exchange 1 removes turns 1-2 from history.

### Output File Requirements

When Weaver produces the modified JSON:

1. Remove selected exchanges from `history` array
2. Update `valid_history_range` to `[0, history.length]`
3. Regenerate `transcript` array from remaining history
4. Keep all other fields unchanged (`conversation_id`, `tools`, `context_manager`, `model_info`, etc.)
5. If `tangent_state` exists and deletions were made in `main_history`, update `main_history` and `main_transcript` too

### UI Considerations (P1)

- Display each exchange as a card: user prompt (truncated), tools used badges, assistant response preview
- Checkbox to mark for deletion
- Show a diff/preview of what the output will look like before exporting
- Export button produces the modified JSON file for download
- Import via file upload or direct path input

---

## Improvement Notes for Final Weaver Implementation

The current `test-dev.json` hooks setup is a **proof-of-concept only**. The final weaver implementation should address:

1. **Per-session log files**: The `agentSpawn` hook should generate a unique session ID (e.g., UUID or timestamp-based) and write it to a known location (env var, temp file, or a session registry). All subsequent hooks in that session read the session ID and write to a session-specific log file (e.g., `weaver-logs/<session-id>.jsonl`). This ensures log files map 1:1 to conversations.

2. **Session metadata**: The `agentSpawn` hook should also log metadata like agent name, cwd, start time, and model — creating a session index that the dashboard can use for listing/filtering conversations.

3. **Log size management**: `postToolUse` responses (especially `fs_read` of large files) can produce massive log entries. The hook script should truncate `tool_response.result` beyond a configurable threshold (e.g., first 500 chars + `"...[truncated]"`).

4. **Tangent detection workaround**: Since hooks can't detect `/tangent`, weaver could:
   - Use a `userPromptSubmit` hook that periodically triggers a `/chat save-via-script` to capture tangent state.
   - Or provide a weaver-specific command/shortcut that wraps `/tangent` and logs the transition.
   - Or watch for the `tangent_state` field in saved conversation snapshots.

5. **Structured log format**: Move from raw JSONL to a more structured format that separates session metadata, conversation events, and tool interactions for easier querying by the dashboard.
