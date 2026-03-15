import { regenerateTranscript, pruneConversation } from "./prune-conversation";
import {
  promptResponse,
  promptToolUse,
  toolResultResponse,
  makeSavedConversation,
} from "./conversation-parser.test-utils";

describe("regenerateTranscript", () => {
  it('prefixes user prompts with "> "', () => {
    const transcript = regenerateTranscript([promptResponse("hello", "hi")]);
    expect(transcript[0]).toBe("> hello");
  });

  it("appends [Tool uses: none] for non-tool responses", () => {
    const transcript = regenerateTranscript([promptResponse("hello", "hi")]);
    expect(transcript[1]).toBe("hi\n[Tool uses: none]");
  });

  it("appends [Tool uses: name] for tool use turns", () => {
    const transcript = regenerateTranscript([promptToolUse("read", "fs_read")]);
    expect(transcript[1]).toBe("Using fs_read\n[Tool uses: fs_read]");
  });

  it("omits user prefix for ToolUseResults turns", () => {
    const history = [
      promptToolUse("read", "fs_read"),
      toolResultResponse("contents"),
    ];
    const transcript = regenerateTranscript(history);
    expect(transcript).toHaveLength(3);
    expect(transcript[2]).toBe("contents\n[Tool uses: none]");
    expect(transcript[2]).not.toMatch(/^> /);
  });
});

describe("pruneConversation", () => {
  it("removes selected exchanges and updates metadata", () => {
    const saved = makeSavedConversation([
      promptResponse("first", "a1"),
      promptResponse("second", "a2"),
      promptResponse("third", "a3"),
    ]);
    const pruned = pruneConversation(saved, new Set([1]));
    expect(pruned.history).toHaveLength(2);
    expect(pruned.valid_history_range).toEqual([0, 2]);
    expect(pruned.transcript[0]).toBe("> first");
    expect(pruned.transcript[2]).toBe("> third");
  });

  it("produces empty history when all exchanges deleted", () => {
    const saved = makeSavedConversation([promptResponse("only", "one")]);
    const pruned = pruneConversation(saved, new Set([0]));
    expect(pruned.history).toHaveLength(0);
    expect(pruned.valid_history_range).toEqual([0, 0]);
    expect(pruned.transcript).toEqual([]);
  });

  it("preserves unmodified fields", () => {
    const saved = makeSavedConversation([promptResponse("a", "b")]);
    const pruned = pruneConversation(saved, new Set());
    expect(pruned.conversation_id).toBe("test-id");
    expect(pruned.tools).toEqual({});
  });

  describe("with tangent", () => {
    function makeTangentConversation() {
      const mainHistory = [
        promptResponse("main1", "a1"),
        promptResponse("main2", "a2"),
      ];
      const tangentHistory = [
        promptResponse("tangent1", "t1"),
        promptResponse("tangent2", "t2"),
      ];
      return makeSavedConversation([...mainHistory, ...tangentHistory], {
        tangent_state: {
          main_history: mainHistory,
          main_transcript: [
            "> main1",
            "a1\n[Tool uses: none]",
            "> main2",
            "a2\n[Tool uses: none]",
          ],
          tangent_start_time: "2026-03-02T11:00:00Z",
        },
      });
    }

    it("updates tangent_state.main_history when deleting from main", () => {
      const saved = makeTangentConversation();
      const pruned = pruneConversation(saved, new Set([0]));
      expect(pruned.tangent_state!.main_history).toHaveLength(1);
      expect(pruned.tangent_state!.main_history[0].user.content).toEqual({
        Prompt: { prompt: "main2" },
      });
      expect(pruned.history).toHaveLength(3);
    });

    it("updates top-level history when deleting from tangent", () => {
      const saved = makeTangentConversation();
      const pruned = pruneConversation(saved, new Set(), new Set([0]));
      expect(pruned.history).toHaveLength(3);
      expect(pruned.tangent_state!.main_history).toHaveLength(2);
    });

    it("removes tangent_state when all tangent exchanges deleted", () => {
      const saved = makeTangentConversation();
      const pruned = pruneConversation(saved, new Set(), new Set([0, 1]));
      expect(pruned.tangent_state).toBeUndefined();
      expect(pruned.history).toHaveLength(2);
    });

    it("regenerates main_transcript when main exchanges deleted", () => {
      const saved = makeTangentConversation();
      const pruned = pruneConversation(saved, new Set([1]));
      expect(pruned.tangent_state!.main_transcript).toEqual([
        "> main1",
        "a1\n[Tool uses: none]",
      ]);
    });
  });
});
