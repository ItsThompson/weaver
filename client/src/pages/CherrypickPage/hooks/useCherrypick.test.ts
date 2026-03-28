import { renderHook, act } from "@testing-library/react";
import { useCherrypick } from "./useCherrypick";
import {
  promptResponse,
  makeSavedConversation,
} from "../../../utils/conversation-parser.test-utils";
import type { SavedConversation } from "../../../types/conversation";

// Mock FileReader so readAsText synchronously triggers onload
class MockFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  readAsText(file: File) {
    file.text().then((text) => {
      this.result = text;
      this.onload?.();
    });
  }
}
vi.stubGlobal("FileReader", MockFileReader);

function makeFile(content: string, name = "test.json"): File {
  return new File([content], name, { type: "application/json" });
}

// Minimal valid conversation with 2 exchanges
const validConversation = makeSavedConversation([
  promptResponse("first question", "first answer", "2026-03-02T10:00:00Z"),
  promptResponse("second question", "second answer", "2026-03-02T10:01:00Z"),
]);

const validJson = JSON.stringify(validConversation);

async function uploadFile(
  result: ReturnType<typeof renderHook<ReturnType<typeof useCherrypick>>>,
  content: string,
  name = "test.json",
) {
  await act(async () => {
    result.result.current.actions.handleFile(makeFile(content, name));
    // flush microtask for File.text() promise
    await Promise.resolve();
  });
}

describe("useCherrypick", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("phase transitions", () => {
    it("initial state is upload phase with no error", () => {
      const { result } = renderHook(() => useCherrypick());
      expect(result.current.state.pageState.phase).toBe("upload");
      expect(result.current.state.error).toBeNull();
    });

    it("transitions to edit phase after handleFile with valid JSON", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson, "convo.json");

      expect(hook.result.current.state.pageState.phase).toBe("edit");
      expect(hook.result.current.state.error).toBeNull();
      const ps = hook.result.current.state.pageState;
      if (ps.phase === "edit") {
        expect(ps.fileName).toBe("convo.json");
        expect(ps.parsed.mainExchanges).toHaveLength(2);
      }
    });

    it("transitions to preview phase after handlePreview", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);

      act(() => hook.result.current.actions.handlePreview());

      expect(hook.result.current.state.pageState.phase).toBe("preview");
    });

    it("returns to upload phase after handleReset", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);

      act(() => hook.result.current.actions.handleReset());

      expect(hook.result.current.state.pageState.phase).toBe("upload");
      expect(hook.result.current.state.error).toBeNull();
    });

    it("returns to edit phase after goBackToEdit from preview", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);
      act(() => hook.result.current.actions.handlePreview());
      expect(hook.result.current.state.pageState.phase).toBe("preview");

      act(() => hook.result.current.actions.goBackToEdit());

      expect(hook.result.current.state.pageState.phase).toBe("edit");
    });
  });

  describe("error handling", () => {
    it("sets error for invalid JSON", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, "{not valid json");

      expect(hook.result.current.state.error).toBe("Failed to parse JSON file");
      expect(hook.result.current.state.pageState.phase).toBe("upload");
    });

    it("sets error when history is missing", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, JSON.stringify({ conversation_id: "x" }));

      expect(hook.result.current.state.error).toBe(
        "Invalid file: missing history or conversation_id",
      );
      expect(hook.result.current.state.pageState.phase).toBe("upload");
    });

    it("sets error when conversation_id is missing", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, JSON.stringify({ history: [] }));

      expect(hook.result.current.state.error).toBe(
        "Invalid file: missing history or conversation_id",
      );
      expect(hook.result.current.state.pageState.phase).toBe("upload");
    });
  });

  describe("selection toggling", () => {
    it("toggleMainId adds and removes ids", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);

      act(() => hook.result.current.actions.toggleMainId(1));
      expect(hook.result.current.state.deleteMainIds.has(1)).toBe(true);
      expect(hook.result.current.state.totalSelected).toBe(1);

      act(() => hook.result.current.actions.toggleMainId(1));
      expect(hook.result.current.state.deleteMainIds.has(1)).toBe(false);
      expect(hook.result.current.state.totalSelected).toBe(0);
    });

    it("toggleTangentId adds and removes ids", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);

      act(() => hook.result.current.actions.toggleTangentId(2));
      expect(hook.result.current.state.deleteTangentIds.has(2)).toBe(true);
      expect(hook.result.current.state.totalSelected).toBe(1);

      act(() => hook.result.current.actions.toggleTangentId(2));
      expect(hook.result.current.state.deleteTangentIds.has(2)).toBe(false);
      expect(hook.result.current.state.totalSelected).toBe(0);
    });

    it("toggleAllMain selects all then deselects all", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);

      const ps = hook.result.current.state.pageState;
      if (ps.phase !== "edit") {
        throw new Error("expected edit phase");
      }
      const exchanges = ps.parsed.mainExchanges;

      act(() => hook.result.current.actions.toggleAllMain(exchanges));
      expect(hook.result.current.state.deleteMainIds.size).toBe(
        exchanges.length,
      );

      act(() => hook.result.current.actions.toggleAllMain(exchanges));
      expect(hook.result.current.state.deleteMainIds.size).toBe(0);
    });

    it("totalSelected reflects sum of both sets", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);

      act(() => {
        hook.result.current.actions.toggleMainId(1);
      });
      act(() => {
        hook.result.current.actions.toggleTangentId(2);
      });
      expect(hook.result.current.state.totalSelected).toBe(2);
    });
  });

  describe("download", () => {
    it("creates blob and triggers download in preview phase", async () => {
      const mockCreateObjectURL = vi.fn(() => "blob:test");
      const mockRevokeObjectURL = vi.fn();
      URL.createObjectURL = mockCreateObjectURL;
      URL.revokeObjectURL = mockRevokeObjectURL;

      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag) => {
        if (tag === "a") {
          return { click: clickSpy } as unknown as HTMLAnchorElement;
        }
        return origCreateElement(tag);
      });

      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);
      act(() => hook.result.current.actions.handlePreview());

      act(() => hook.result.current.actions.handleDownload());

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test");
    });

    it("does nothing outside preview phase", async () => {
      const mockCreateObjectURL = vi.fn();
      URL.createObjectURL = mockCreateObjectURL;

      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);
      // In edit phase, not preview
      act(() => hook.result.current.actions.handleDownload());

      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });
  });

  describe("reset clears everything", () => {
    it("clears selections, error, and returns to upload", async () => {
      const hook = renderHook(() => useCherrypick());
      await uploadFile(hook, validJson);

      act(() => hook.result.current.actions.toggleMainId(1));
      act(() => hook.result.current.actions.toggleTangentId(2));
      expect(hook.result.current.state.totalSelected).toBe(2);

      act(() => hook.result.current.actions.handleReset());

      expect(hook.result.current.state.pageState.phase).toBe("upload");
      expect(hook.result.current.state.deleteMainIds.size).toBe(0);
      expect(hook.result.current.state.deleteTangentIds.size).toBe(0);
      expect(hook.result.current.state.totalSelected).toBe(0);
      expect(hook.result.current.state.error).toBeNull();
    });
  });
});
