import type {
  SavedConversation,
  ConversationTurn,
  ConversationExchange,
  ParsedConversation,
} from '../types/conversation';

/** Extract the user prompt string from a turn, or null if it's a ToolUseResults turn. */
function getUserPrompt(turn: ConversationTurn): string | null {
  if ('Prompt' in turn.user.content) return turn.user.content.Prompt.prompt;
  return null;
}

/** Extract the assistant's final text content from a turn. */
function getAssistantContent(turn: ConversationTurn): string {
  if ('Response' in turn.assistant) return turn.assistant.Response.content;
  if ('ToolUse' in turn.assistant) return turn.assistant.ToolUse.content;
  return '';
}

/** Extract tool names from a ToolUse assistant response. */
function getToolNames(turn: ConversationTurn): string[] {
  if ('ToolUse' in turn.assistant) {
    return turn.assistant.ToolUse.tool_uses.map((t) => t.name);
  }
  return [];
}

/** Check if the assistant response is a final Response (not a ToolUse). */
function isFinalResponse(turn: ConversationTurn): boolean {
  return 'Response' in turn.assistant;
}

/**
 * Group a history array into ConversationExchanges.
 *
 * A new exchange starts at each Prompt turn and continues through
 * ToolUseResults turns until the assistant produces a Response.
 */
export function groupIntoExchanges(history: ConversationTurn[]): ConversationExchange[] {
  const exchanges: ConversationExchange[] = [];
  let current: { startIndex: number; turns: ConversationTurn[] } | null = null;

  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    if (getUserPrompt(turn) !== null) {
      // Start a new exchange
      current = { startIndex: i, turns: [turn] };
    } else if (current) {
      current.turns.push(turn);
    }

    if (current && isFinalResponse(turn)) {
      const firstTurn = current.turns[0];
      const allTools = current.turns.flatMap(getToolNames);
      exchanges.push({
        id: exchanges.length,
        userPrompt: getUserPrompt(firstTurn)!,
        turns: current.turns,
        toolsUsed: allTools,
        assistantResponse: getAssistantContent(turn),
        timestamp: firstTurn.user.timestamp ?? '',
        turnIndices: [current.startIndex, i],
      });
      current = null;
    }
  }

  return exchanges;
}

/**
 * Parse a SavedConversation into main and tangent exchanges.
 */
export function parseConversation(saved: SavedConversation): ParsedConversation {
  const isInTangent = !!saved.tangent_state;

  if (isInTangent) {
    const mainHistory = saved.tangent_state!.main_history;
    const tangentHistory = saved.history.slice(mainHistory.length);
    return {
      raw: saved,
      mainExchanges: groupIntoExchanges(mainHistory),
      tangentExchanges: groupIntoExchanges(tangentHistory),
      isInTangent: true,
    };
  }

  return {
    raw: saved,
    mainExchanges: groupIntoExchanges(saved.history),
    tangentExchanges: null,
    isInTangent: false,
  };
}

/**
 * Regenerate the transcript array from a history array.
 *
 * Each Prompt turn produces a "> {prompt}" entry.
 * Every turn produces an assistant entry with "[Tool uses: ...]" suffix.
 */
export function regenerateTranscript(history: ConversationTurn[]): string[] {
  const transcript: string[] = [];

  for (const turn of history) {
    const prompt = getUserPrompt(turn);
    if (prompt !== null) {
      transcript.push(`> ${prompt}`);
    }

    const tools = getToolNames(turn);
    const toolSuffix = tools.length > 0 ? `[Tool uses: ${tools.join(', ')}]` : '[Tool uses: none]';
    const content = getAssistantContent(turn);
    transcript.push(`${content}\n${toolSuffix}`);
  }

  return transcript;
}

/**
 * Produce a pruned SavedConversation with selected exchanges removed.
 *
 * deleteMainIds: exchange IDs to remove from main history
 * deleteTangentIds: exchange IDs to remove from tangent history (only when in tangent)
 */
export function pruneConversation(
  original: SavedConversation,
  deleteMainIds: Set<number>,
  deleteTangentIds: Set<number> = new Set(),
): SavedConversation {
  const isInTangent = !!original.tangent_state;

  if (!isInTangent) {
    const mainExchanges = groupIntoExchanges(original.history);
    const keptTurns = mainExchanges
      .filter((ex) => !deleteMainIds.has(ex.id))
      .flatMap((ex) => ex.turns);

    return {
      ...original,
      history: keptTurns,
      valid_history_range: [0, keptTurns.length],
      transcript: regenerateTranscript(keptTurns),
    };
  }

  // Tangent-aware pruning
  const mainHistory = original.tangent_state!.main_history;
  const tangentHistory = original.history.slice(mainHistory.length);

  const mainExchanges = groupIntoExchanges(mainHistory);
  const tangentExchanges = groupIntoExchanges(tangentHistory);

  const keptMainTurns = mainExchanges
    .filter((ex) => !deleteMainIds.has(ex.id))
    .flatMap((ex) => ex.turns);

  const keptTangentTurns = tangentExchanges
    .filter((ex) => !deleteTangentIds.has(ex.id))
    .flatMap((ex) => ex.turns);

  // If all tangent exchanges deleted, remove tangent_state entirely
  const allTangentDeleted = keptTangentTurns.length === 0;
  const fullHistory = [...keptMainTurns, ...keptTangentTurns];

  const result: SavedConversation = {
    ...original,
    history: fullHistory,
    valid_history_range: [0, fullHistory.length],
    transcript: regenerateTranscript(fullHistory),
  };

  if (allTangentDeleted) {
    delete result.tangent_state;
  } else {
    result.tangent_state = {
      ...original.tangent_state!,
      main_history: keptMainTurns,
      main_transcript: regenerateTranscript(keptMainTurns),
    };
  }

  return result;
}
