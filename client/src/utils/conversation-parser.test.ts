import type { ConversationTurn, SavedConversation } from '@weaver/shared/types';
import {
  groupIntoExchanges,
  parseConversation,
  regenerateTranscript,
  pruneConversation,
} from './conversation-parser';

// -- Test helpers --

function makeTurn(
  content: ConversationTurn['user']['content'],
  assistant: ConversationTurn['assistant'],
  timestamp = '2026-03-02T10:00:00Z',
): ConversationTurn {
  return {
    user: {
      additional_context: '',
      env_context: { env_state: { operating_system: 'macos', current_working_directory: '/tmp', environment_variables: [] } },
      content,
      timestamp,
      images: null,
    },
    assistant,
    request_metadata: {
      request_id: 'r1', context_usage_percentage: 0, message_id: 'm1',
      request_start_timestamp_ms: 0, stream_end_timestamp_ms: 0,
      user_prompt_length: 0, response_size: 0,
      chat_conversation_type: 'NotToolUse', tool_use_ids_and_names: [], model_id: 'test',
    },
  };
}

function promptResponse(prompt: string, response: string, ts?: string): ConversationTurn {
  return makeTurn(
    { Prompt: { prompt } },
    { Response: { message_id: 'm1', content: response } },
    ts,
  );
}

function promptToolUse(prompt: string, toolName: string, ts?: string): ConversationTurn {
  return makeTurn(
    { Prompt: { prompt } },
    { ToolUse: { message_id: 'm1', content: `Using ${toolName}`, tool_uses: [{ id: 't1', name: toolName, orig_name: toolName, args: {}, orig_args: {} }] } },
    ts,
  );
}

function toolResultResponse(response: string): ConversationTurn {
  return makeTurn(
    { ToolUseResults: { tool_use_results: [{ tool_use_id: 't1', content: [{ Text: 'result' }], status: 'Success' }] } },
    { Response: { message_id: 'm2', content: response } },
  );
}

function toolResultToolUse(toolName: string): ConversationTurn {
  return makeTurn(
    { ToolUseResults: { tool_use_results: [{ tool_use_id: 't1', content: [{ Text: 'result' }], status: 'Success' }] } },
    { ToolUse: { message_id: 'm2', content: `Using ${toolName}`, tool_uses: [{ id: 't2', name: toolName, orig_name: toolName, args: {}, orig_args: {} }] } },
  );
}

function makeSavedConversation(history: ConversationTurn[], overrides?: Partial<SavedConversation>): SavedConversation {
  return {
    conversation_id: 'test-id',
    next_message: null,
    history,
    valid_history_range: [0, history.length],
    transcript: [],
    tools: {},
    context_manager: { max_context_files_size: 0, current_profile: '', paths: [], hooks: {} },
    context_message_length: 0,
    model_info: {},
    ...overrides,
  };
}

// -- Tests --

describe('groupIntoExchanges', () => {
  it('returns empty array for empty history', () => {
    expect(groupIntoExchanges([])).toEqual([]);
  });

  it('groups simple prompt/response pairs', () => {
    const history = [
      promptResponse('hello', 'hi'),
      promptResponse('how are you', 'good'),
    ];
    const exchanges = groupIntoExchanges(history);
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0].userPrompt).toBe('hello');
    expect(exchanges[0].turnIndices).toEqual([0, 0]);
    expect(exchanges[0].toolsUsed).toEqual([]);
    expect(exchanges[1].userPrompt).toBe('how are you');
    expect(exchanges[1].turnIndices).toEqual([1, 1]);
  });

  it('groups a tool use chain into a single exchange', () => {
    const history = [
      promptToolUse('read file', 'fs_read'),
      toolResultResponse('here is the file'),
    ];
    const exchanges = groupIntoExchanges(history);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].userPrompt).toBe('read file');
    expect(exchanges[0].turns).toHaveLength(2);
    expect(exchanges[0].toolsUsed).toEqual(['fs_read']);
    expect(exchanges[0].assistantResponse).toBe('here is the file');
    expect(exchanges[0].turnIndices).toEqual([0, 1]);
  });

  it('groups a multi-step tool chain into a single exchange', () => {
    const history = [
      promptToolUse('do stuff', 'fs_read'),
      toolResultToolUse('fs_write'),
      toolResultResponse('done'),
    ];
    const exchanges = groupIntoExchanges(history);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].turns).toHaveLength(3);
    expect(exchanges[0].toolsUsed).toEqual(['fs_read', 'fs_write']);
    expect(exchanges[0].turnIndices).toEqual([0, 2]);
  });

  it('handles mixed simple and tool use exchanges', () => {
    const history = [
      promptResponse('hello', 'hi'),
      promptToolUse('read', 'fs_read'),
      toolResultResponse('contents'),
      promptResponse('thanks', 'welcome'),
    ];
    const exchanges = groupIntoExchanges(history);
    expect(exchanges).toHaveLength(3);
    expect(exchanges[0].turnIndices).toEqual([0, 0]);
    expect(exchanges[1].turnIndices).toEqual([1, 2]);
    expect(exchanges[2].turnIndices).toEqual([3, 3]);
  });
});

describe('parseConversation', () => {
  it('parses a non-tangent conversation', () => {
    const saved = makeSavedConversation([
      promptResponse('hello', 'hi'),
    ]);
    const parsed = parseConversation(saved);
    expect(parsed.isInTangent).toBe(false);
    expect(parsed.mainExchanges).toHaveLength(1);
    expect(parsed.tangentExchanges).toBeNull();
  });

  it('splits main and tangent exchanges when tangent_state exists', () => {
    const mainHistory = [promptResponse('main q', 'main a')];
    const tangentHistory = [promptResponse('tangent q', 'tangent a')];
    const saved = makeSavedConversation(
      [...mainHistory, ...tangentHistory],
      {
        tangent_state: {
          main_history: mainHistory,
          main_transcript: [],
          tangent_start_time: '2026-03-02T11:00:00Z',
        },
      },
    );
    const parsed = parseConversation(saved);
    expect(parsed.isInTangent).toBe(true);
    expect(parsed.mainExchanges).toHaveLength(1);
    expect(parsed.mainExchanges[0].userPrompt).toBe('main q');
    expect(parsed.tangentExchanges).toHaveLength(1);
    expect(parsed.tangentExchanges![0].userPrompt).toBe('tangent q');
  });
});

describe('regenerateTranscript', () => {
  it('prefixes user prompts with "> "', () => {
    const transcript = regenerateTranscript([promptResponse('hello', 'hi')]);
    expect(transcript[0]).toBe('> hello');
  });

  it('appends [Tool uses: none] for non-tool responses', () => {
    const transcript = regenerateTranscript([promptResponse('hello', 'hi')]);
    expect(transcript[1]).toBe('hi\n[Tool uses: none]');
  });

  it('appends [Tool uses: name] for tool use turns', () => {
    const transcript = regenerateTranscript([promptToolUse('read', 'fs_read')]);
    expect(transcript[1]).toBe('Using fs_read\n[Tool uses: fs_read]');
  });

  it('omits user prefix for ToolUseResults turns', () => {
    const history = [
      promptToolUse('read', 'fs_read'),
      toolResultResponse('contents'),
    ];
    const transcript = regenerateTranscript(history);
    // [0] = "> read", [1] = tool use content, [2] = response (no "> " prefix)
    expect(transcript).toHaveLength(3);
    expect(transcript[2]).toBe('contents\n[Tool uses: none]');
    expect(transcript[2]).not.toMatch(/^> /);
  });
});

describe('pruneConversation', () => {
  it('removes selected exchanges and updates metadata', () => {
    const saved = makeSavedConversation([
      promptResponse('first', 'a1'),
      promptResponse('second', 'a2'),
      promptResponse('third', 'a3'),
    ]);
    const pruned = pruneConversation(saved, new Set([1]));
    expect(pruned.history).toHaveLength(2);
    expect(pruned.valid_history_range).toEqual([0, 2]);
    expect(pruned.transcript[0]).toBe('> first');
    expect(pruned.transcript[2]).toBe('> third');
  });

  it('produces empty history when all exchanges deleted', () => {
    const saved = makeSavedConversation([promptResponse('only', 'one')]);
    const pruned = pruneConversation(saved, new Set([0]));
    expect(pruned.history).toHaveLength(0);
    expect(pruned.valid_history_range).toEqual([0, 0]);
    expect(pruned.transcript).toEqual([]);
  });

  it('preserves unmodified fields', () => {
    const saved = makeSavedConversation([promptResponse('a', 'b')]);
    const pruned = pruneConversation(saved, new Set());
    expect(pruned.conversation_id).toBe('test-id');
    expect(pruned.tools).toEqual({});
  });

  describe('with tangent', () => {
    function makeTangentConversation() {
      const mainHistory = [
        promptResponse('main1', 'a1'),
        promptResponse('main2', 'a2'),
      ];
      const tangentHistory = [
        promptResponse('tangent1', 't1'),
        promptResponse('tangent2', 't2'),
      ];
      return makeSavedConversation(
        [...mainHistory, ...tangentHistory],
        {
          tangent_state: {
            main_history: mainHistory,
            main_transcript: ['> main1', 'a1\n[Tool uses: none]', '> main2', 'a2\n[Tool uses: none]'],
            tangent_start_time: '2026-03-02T11:00:00Z',
          },
        },
      );
    }

    it('updates tangent_state.main_history when deleting from main', () => {
      const saved = makeTangentConversation();
      const pruned = pruneConversation(saved, new Set([0]));
      expect(pruned.tangent_state!.main_history).toHaveLength(1);
      expect(pruned.tangent_state!.main_history[0].user.content).toEqual({ Prompt: { prompt: 'main2' } });
      // Full history = 1 main + 2 tangent = 3
      expect(pruned.history).toHaveLength(3);
    });

    it('updates top-level history when deleting from tangent', () => {
      const saved = makeTangentConversation();
      const pruned = pruneConversation(saved, new Set(), new Set([0]));
      // 2 main + 1 tangent = 3
      expect(pruned.history).toHaveLength(3);
      expect(pruned.tangent_state!.main_history).toHaveLength(2);
    });

    it('removes tangent_state when all tangent exchanges deleted', () => {
      const saved = makeTangentConversation();
      const pruned = pruneConversation(saved, new Set(), new Set([0, 1]));
      expect(pruned.tangent_state).toBeUndefined();
      expect(pruned.history).toHaveLength(2);
    });

    it('regenerates main_transcript when main exchanges deleted', () => {
      const saved = makeTangentConversation();
      const pruned = pruneConversation(saved, new Set([1]));
      expect(pruned.tangent_state!.main_transcript).toEqual([
        '> main1',
        'a1\n[Tool uses: none]',
      ]);
    });
  });
});
