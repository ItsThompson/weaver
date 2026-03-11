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
    | {
        ToolUse: {
          message_id: string;
          content: string;
          tool_uses: ToolUseCall[];
        };
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

// A deletable unit: the user's prompt through all tool use/result turns to the final response
export interface ConversationExchange {
  id: number;
  userPrompt: string;
  turns: ConversationTurn[];
  toolsUsed: string[];
  assistantResponse: string;
  timestamp: string;
  turnIndices: [number, number]; // [startIndex, endIndex] in original history array
}

// Result of parsing a /chat save JSON file for the cherrypick flow
export interface ParsedConversation {
  raw: SavedConversation;
  mainExchanges: ConversationExchange[];
  tangentExchanges: ConversationExchange[] | null;
  isInTangent: boolean;
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
