import type {
  ConversationTurn,
  SavedConversation,
} from "../types/conversation";

export function makeTurn(
  content: ConversationTurn["user"]["content"],
  assistant: ConversationTurn["assistant"],
  timestamp = "2026-03-02T10:00:00Z",
): ConversationTurn {
  return {
    user: {
      additional_context: "",
      env_context: {
        env_state: {
          operating_system: "macos",
          current_working_directory: "/tmp",
          environment_variables: [],
        },
      },
      content,
      timestamp,
      images: null,
    },
    assistant,
    request_metadata: {
      request_id: "r1",
      context_usage_percentage: 0,
      message_id: "m1",
      request_start_timestamp_ms: 0,
      stream_end_timestamp_ms: 0,
      user_prompt_length: 0,
      response_size: 0,
      chat_conversation_type: "NotToolUse",
      tool_use_ids_and_names: [],
      model_id: "test",
    },
  };
}

export function promptResponse(
  prompt: string,
  response: string,
  ts?: string,
): ConversationTurn {
  return makeTurn(
    { Prompt: { prompt } },
    { Response: { message_id: "m1", content: response } },
    ts,
  );
}

export function promptToolUse(
  prompt: string,
  toolName: string,
  ts?: string,
): ConversationTurn {
  return makeTurn(
    { Prompt: { prompt } },
    {
      ToolUse: {
        message_id: "m1",
        content: `Using ${toolName}`,
        tool_uses: [
          {
            id: "t1",
            name: toolName,
            orig_name: toolName,
            args: {},
            orig_args: {},
          },
        ],
      },
    },
    ts,
  );
}

export function toolResultResponse(response: string): ConversationTurn {
  return makeTurn(
    {
      ToolUseResults: {
        tool_use_results: [
          {
            tool_use_id: "t1",
            content: [{ Text: "result" }],
            status: "Success",
          },
        ],
      },
    },
    { Response: { message_id: "m2", content: response } },
  );
}

export function toolResultToolUse(toolName: string): ConversationTurn {
  return makeTurn(
    {
      ToolUseResults: {
        tool_use_results: [
          {
            tool_use_id: "t1",
            content: [{ Text: "result" }],
            status: "Success",
          },
        ],
      },
    },
    {
      ToolUse: {
        message_id: "m2",
        content: `Using ${toolName}`,
        tool_uses: [
          {
            id: "t2",
            name: toolName,
            orig_name: toolName,
            args: {},
            orig_args: {},
          },
        ],
      },
    },
  );
}

export function makeSavedConversation(
  history: ConversationTurn[],
  overrides?: Partial<SavedConversation>,
): SavedConversation {
  return {
    conversation_id: "test-id",
    next_message: null,
    history,
    valid_history_range: [0, history.length],
    transcript: [],
    tools: {},
    context_manager: {
      max_context_files_size: 0,
      current_profile: "",
      paths: [],
      hooks: {},
    },
    context_message_length: 0,
    model_info: {},
    ...overrides,
  };
}
