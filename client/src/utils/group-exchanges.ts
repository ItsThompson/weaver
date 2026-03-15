import type {
  SavedConversation,
  ConversationTurn,
  ConversationExchange,
  ParsedConversation,
} from "../types/conversation";

/** Extract the user prompt string from a turn, or null if it's a ToolUseResults turn. */
export function getUserPrompt(turn: ConversationTurn): string | null {
  if ("Prompt" in turn.user.content) {
    return turn.user.content.Prompt.prompt;
  }
  return null;
}

/** Extract the assistant's final text content from a turn. */
export function getAssistantContent(turn: ConversationTurn): string {
  if ("Response" in turn.assistant) {
    return turn.assistant.Response.content;
  }
  if ("ToolUse" in turn.assistant) {
    return turn.assistant.ToolUse.content;
  }
  return "";
}

/** Extract tool names from a ToolUse assistant response. */
export function getToolNames(turn: ConversationTurn): string[] {
  if ("ToolUse" in turn.assistant) {
    return turn.assistant.ToolUse.tool_uses.map((t) => t.name);
  }
  return [];
}

/** Check if the assistant response is a final Response (not a ToolUse). */
export function isFinalResponse(turn: ConversationTurn): boolean {
  return "Response" in turn.assistant;
}

/**
 * Group a history array into ConversationExchanges.
 *
 * A new exchange starts at each Prompt turn and continues through
 * ToolUseResults turns until the assistant produces a Response.
 */
export function groupIntoExchanges(
  history: ConversationTurn[],
): ConversationExchange[] {
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
        timestamp: firstTurn.user.timestamp ?? "",
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
export function parseConversation(
  saved: SavedConversation,
): ParsedConversation {
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
