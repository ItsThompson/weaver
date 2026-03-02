// Session stored in sessions.jsonl (one JSON line per session)
export interface Session {
  id: string;
  pid: number;
  customName: string | null;
  cwd: string;
  agentName: string | null;
  startTime: string;
  lastEventTime: string;
}

// Computed at runtime by checking if pid is still running
export type ActivityStatus = 'starting' | 'idle' | 'processing' | 'running_tool';

export interface SessionWithStatus extends Session {
  status: 'open' | 'closed';
  activity?: ActivityStatus;
}

// Raw hook event as received from kiro-cli via STDIN
export interface HookEventData {
  hook_event_name: string;
  cwd: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: {
    success: boolean;
    result: unknown[];
  };
}

// Timestamped wrapper written to per-session JSONL log files
export interface HookEvent {
  timestamp: string;
  event: HookEventData;
}

// Matched pre/post tool use pair within a turn
export interface ToolCallPair {
  toolName: string;
  input: Record<string, unknown>;
  response?: Record<string, unknown>;
  startTime: string;
  endTime?: string;
}

// A logical conversation turn: user prompt → tool calls → stop
export interface TurnGroup {
  id: number;
  userPrompt: string | null;
  events: HookEvent[];
  toolCalls: ToolCallPair[];
  startTime: string;
  endTime: string;
}

// Structures from /chat save output

export interface ToolUseCall {
  id: string;
  name: string;
  orig_name: string;
  args: Record<string, unknown>;
  orig_args: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: unknown;
  status: string;
}

export interface ConversationTurn {
  user: {
    additional_context: string;
    env_context: {
      env_state: {
        operating_system: string;
        current_working_directory: string;
        environment_variables: string[];
      };
    };
    content:
      | { Prompt: { prompt: string } }
      | { ToolUseResults: { tool_use_results: ToolResult[] } };
    timestamp: string;
    images: null;
  };
  assistant:
    | { Response: { message_id: string; content: string } }
    | { ToolUse: { message_id: string; content: string; tool_uses: ToolUseCall[] } };
  request_metadata: {
    request_id: string;
    context_usage_percentage: number;
    message_id: string;
    request_start_timestamp_ms: number;
    stream_end_timestamp_ms: number;
    user_prompt_length: number;
    response_size: number;
    chat_conversation_type: 'NotToolUse' | 'ToolUse';
    tool_use_ids_and_names: [string, string][];
    model_id: string;
  };
}

// A deletable unit: the user's prompt through all tool use/result turns to the final response
export interface ConversationExchange {
  id: number;
  userPrompt: string;
  turns: ConversationTurn[];
  toolsUsed: string[];
  assistantResponse: string;
  timestamp: string;
}

export interface TangentState {
  main_history: ConversationTurn[];
  main_transcript: string[];
  tangent_start_time: string;
}

export interface SavedConversation {
  conversation_id: string;
  next_message: null;
  history: ConversationTurn[];
  valid_history_range: [number, number];
  transcript: string[];
  tools: Record<string, unknown[]>;
  context_manager: {
    max_context_files_size: number;
    current_profile: string;
    paths: string[];
    hooks: Record<string, unknown>;
  };
  context_message_length: number;
  model_info: Record<string, unknown>;
  tangent_state?: TangentState;
}
