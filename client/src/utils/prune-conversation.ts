import type {
  SavedConversation,
  ConversationTurn,
} from "../types/conversation";
import {
  groupIntoExchanges,
  getUserPrompt,
  getToolNames,
  getAssistantContent,
} from "./group-exchanges";

/**
 * Regenerate the transcript array from a history array.
 *
 * Each Prompt turn produces a "> {prompt}" entry.
 * Every turn produces an assistant entry with "[Tool uses: ...]" suffix.
 */
export function regenerateTranscript(history: ConversationTurn[]): string[] {
  return history.flatMap((turn) => {
    const lines: string[] = [];
    const prompt = getUserPrompt(turn);
    if (prompt !== null) {
      lines.push(`> ${prompt}`);
    }

    const tools = getToolNames(turn);
    const toolSuffix =
      tools.length > 0
        ? `[Tool uses: ${tools.join(", ")}]`
        : "[Tool uses: none]";
    const content = getAssistantContent(turn);
    lines.push(`${content}\n${toolSuffix}`);
    return lines;
  });
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
    const keptTurns = mainExchanges.reduce<ConversationTurn[]>(
      (acc, exchange) => {
        if (!deleteMainIds.has(exchange.id)) {
          acc.push(...exchange.turns);
        }
        return acc;
      },
      [],
    );

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

  const keptMainTurns = mainExchanges.reduce<ConversationTurn[]>(
    (acc, exchange) => {
      if (!deleteMainIds.has(exchange.id)) {
        acc.push(...exchange.turns);
      }
      return acc;
    },
    [],
  );

  const keptTangentTurns = tangentExchanges.reduce<ConversationTurn[]>(
    (acc, exchange) => {
      if (!deleteTangentIds.has(exchange.id)) {
        acc.push(...exchange.turns);
      }
      return acc;
    },
    [],
  );

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
