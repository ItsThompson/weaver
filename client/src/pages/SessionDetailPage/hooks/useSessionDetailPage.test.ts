import { renderHook, act } from "@testing-library/react";
import { useSessionDetailPage } from "./useSessionDetailPage";
import type { SessionWithStatus, TurnGroup } from "@weaver/shared/types";

interface SessionQueryData {
  session: SessionWithStatus;
  turns: TurnGroup[];
  webhookEnabled: boolean;
  activeSkills: string[];
  configuredSkills: string[];
}

const mockNavigate = vi.fn();
let mockParams: Record<string, string> = { id: "abc12345-def6-7890" };

vi.mock("react-router-dom", () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

const mockMutate = vi.fn();
let mockSessionQuery: {
  data: SessionQueryData | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: ReturnType<typeof vi.fn>;
} = { data: undefined, error: undefined, isLoading: false, mutate: mockMutate };

vi.mock("../../../hooks/queries", () => ({
  useSessionQuery: () => mockSessionQuery,
}));

const mockUpdateSessionName = vi.fn().mockResolvedValue({});
const mockToggleSessionWebhook = vi.fn().mockResolvedValue({});
vi.mock("../../../utils/api", () => ({
  updateSessionName: (...args: unknown[]) => mockUpdateSessionName(...args),
  toggleSessionWebhook: (...args: unknown[]) =>
    mockToggleSessionWebhook(...args),
}));

const mockSession: SessionWithStatus = {
  id: "abc12345-def6-7890",
  pid: 12345,
  cwd: "/test/path",
  status: "open",
  customName: null,
  agentName: "dev",
  startTime: "2024-01-01T10:00:00Z",
  lastEventTime: "2024-01-01T10:05:00Z",
};

const mockTurns: TurnGroup[] = [
  {
    id: 1,
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T10:01:00Z",
    events: [],
    userPrompt: null,
    toolCalls: [],
    validationResults: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = { id: "abc12345-def6-7890" };
  mockSessionQuery = {
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: mockMutate,
  };
});

describe("useSessionDetailPage", () => {
  describe("displayName", () => {
    it("falls back to truncated id when customName is null", () => {
      mockSessionQuery.data = {
        session: { ...mockSession, customName: null },
        turns: [],
        webhookEnabled: false,
        activeSkills: [],
        configuredSkills: [],
      };

      const { result } = renderHook(() => useSessionDetailPage());
      expect(result.current.state.displayName).toBe("Session abc12345");
    });

    it("uses customName when available", () => {
      mockSessionQuery.data = {
        session: { ...mockSession, customName: "My Project" },
        turns: [],
        webhookEnabled: false,
        activeSkills: [],
        configuredSkills: [],
      };

      const { result } = renderHook(() => useSessionDetailPage());
      expect(result.current.state.displayName).toBe("My Project");
    });
  });

  describe("togglePageTools", () => {
    it("toggles showTools and clears expandedTurns", () => {
      const { result } = renderHook(() => useSessionDetailPage());

      // Add an expanded turn first
      act(() => result.current.actions.toggleTurn(1));
      act(() => result.current.actions.toggleTurn(3));
      expect(result.current.state.expandedTurns).toEqual(new Set([1, 3]));
      expect(result.current.state.showTools).toBe(true);

      // Toggle page tools
      act(() => result.current.actions.togglePageTools());
      expect(result.current.state.showTools).toBe(false);
      expect(result.current.state.expandedTurns).toEqual(new Set());
    });
  });

  describe("toggleTurn", () => {
    it("adds and removes turn IDs", () => {
      const { result } = renderHook(() => useSessionDetailPage());

      act(() => result.current.actions.toggleTurn(5));
      expect(result.current.state.expandedTurns).toEqual(new Set([5]));

      act(() => result.current.actions.toggleTurn(5));
      expect(result.current.state.expandedTurns).toEqual(new Set());
    });
  });

  describe("handleRename", () => {
    it("calls updateSessionName and mutate", async () => {
      mockSessionQuery.data = {
        session: mockSession,
        turns: mockTurns,
        webhookEnabled: false,
        activeSkills: [],
        configuredSkills: [],
      };

      const { result } = renderHook(() => useSessionDetailPage());

      await act(() => result.current.actions.handleRename("New Name"));

      expect(mockUpdateSessionName).toHaveBeenCalledWith(
        "abc12345-def6-7890",
        "New Name",
      );
      expect(mockMutate).toHaveBeenCalled();
    });

    it("does nothing when id or data is missing", async () => {
      mockParams = {};
      const { result } = renderHook(() => useSessionDetailPage());

      await act(() => result.current.actions.handleRename("New Name"));

      expect(mockUpdateSessionName).not.toHaveBeenCalled();
    });
  });

  describe("handleToggleWebhook", () => {
    it("calls toggleSessionWebhook with inverted value", async () => {
      mockSessionQuery.data = {
        session: mockSession,
        turns: mockTurns,
        webhookEnabled: false,
        activeSkills: [],
        configuredSkills: [],
      };

      const { result } = renderHook(() => useSessionDetailPage());

      await act(() => result.current.actions.handleToggleWebhook());

      expect(mockToggleSessionWebhook).toHaveBeenCalledWith(
        "abc12345-def6-7890",
        true,
      );
      expect(mockMutate).toHaveBeenCalled();
    });
  });

  describe("state derivation", () => {
    it("defaults to empty values when no data", () => {
      const { result } = renderHook(() => useSessionDetailPage());

      expect(result.current.state.session).toBeNull();
      expect(result.current.state.turns).toEqual([]);
      expect(result.current.state.webhookEnabled).toBe(false);
      expect(result.current.state.activeSkills).toEqual([]);
      expect(result.current.state.configuredSkills).toEqual([]);
    });
  });
});
