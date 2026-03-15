import { groupIntoExchanges, parseConversation } from "./group-exchanges";
import {
  promptResponse,
  promptToolUse,
  toolResultResponse,
  toolResultToolUse,
  makeSavedConversation,
} from "./conversation-parser.test-utils";

describe("groupIntoExchanges", () => {
  it("returns empty array for empty history", () => {
    expect(groupIntoExchanges([])).toEqual([]);
  });

  it("groups simple prompt/response pairs", () => {
    const history = [
      promptResponse("hello", "hi"),
      promptResponse("how are you", "good"),
    ];
    const exchanges = groupIntoExchanges(history);
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0].userPrompt).toBe("hello");
    expect(exchanges[0].turnIndices).toEqual([0, 0]);
    expect(exchanges[0].toolsUsed).toEqual([]);
    expect(exchanges[1].userPrompt).toBe("how are you");
    expect(exchanges[1].turnIndices).toEqual([1, 1]);
  });

  it("groups a tool use chain into a single exchange", () => {
    const history = [
      promptToolUse("read file", "fs_read"),
      toolResultResponse("here is the file"),
    ];
    const exchanges = groupIntoExchanges(history);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].userPrompt).toBe("read file");
    expect(exchanges[0].turns).toHaveLength(2);
    expect(exchanges[0].toolsUsed).toEqual(["fs_read"]);
    expect(exchanges[0].assistantResponse).toBe("here is the file");
    expect(exchanges[0].turnIndices).toEqual([0, 1]);
  });

  it("groups a multi-step tool chain into a single exchange", () => {
    const history = [
      promptToolUse("do stuff", "fs_read"),
      toolResultToolUse("fs_write"),
      toolResultResponse("done"),
    ];
    const exchanges = groupIntoExchanges(history);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].turns).toHaveLength(3);
    expect(exchanges[0].toolsUsed).toEqual(["fs_read", "fs_write"]);
    expect(exchanges[0].turnIndices).toEqual([0, 2]);
  });

  it("handles mixed simple and tool use exchanges", () => {
    const history = [
      promptResponse("hello", "hi"),
      promptToolUse("read", "fs_read"),
      toolResultResponse("contents"),
      promptResponse("thanks", "welcome"),
    ];
    const exchanges = groupIntoExchanges(history);
    expect(exchanges).toHaveLength(3);
    expect(exchanges[0].turnIndices).toEqual([0, 0]);
    expect(exchanges[1].turnIndices).toEqual([1, 2]);
    expect(exchanges[2].turnIndices).toEqual([3, 3]);
  });
});

describe("parseConversation", () => {
  it("parses a non-tangent conversation", () => {
    const saved = makeSavedConversation([promptResponse("hello", "hi")]);
    const parsed = parseConversation(saved);
    expect(parsed.isInTangent).toBe(false);
    expect(parsed.mainExchanges).toHaveLength(1);
    expect(parsed.tangentExchanges).toBeNull();
  });

  it("splits main and tangent exchanges when tangent_state exists", () => {
    const mainHistory = [promptResponse("main q", "main a")];
    const tangentHistory = [promptResponse("tangent q", "tangent a")];
    const saved = makeSavedConversation([...mainHistory, ...tangentHistory], {
      tangent_state: {
        main_history: mainHistory,
        main_transcript: [],
        tangent_start_time: "2026-03-02T11:00:00Z",
      },
    });
    const parsed = parseConversation(saved);
    expect(parsed.isInTangent).toBe(true);
    expect(parsed.mainExchanges).toHaveLength(1);
    expect(parsed.mainExchanges[0].userPrompt).toBe("main q");
    expect(parsed.tangentExchanges).toHaveLength(1);
    expect(parsed.tangentExchanges![0].userPrompt).toBe("tangent q");
  });
});
