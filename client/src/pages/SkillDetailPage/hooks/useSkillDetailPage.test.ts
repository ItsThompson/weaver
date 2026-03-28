import { renderHook, act } from "@testing-library/react";
import { useSkillDetailPage } from "./useSkillDetailPage";
import type { SkillDetail, SkillGraph } from "@weaver/shared/types";
import type { WeaverConfig } from "@weaver/shared/types";

const mockNavigate = vi.fn();
let mockParams: Record<string, string> = { skillName: "my-skill" };
let mockSearchParams = new URLSearchParams();
let mockLocationState: unknown = null;

vi.mock("react-router-dom", () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
  useLocation: () => ({ state: mockLocationState }),
}));

const mockSkillDetailQuery: {
  data: SkillDetail | undefined;
  error: Error | undefined;
  isLoading: boolean;
} = { data: undefined, error: undefined, isLoading: false };

const mockConfigQuery: {
  data: { config: Partial<WeaverConfig>; warnings: string[] } | undefined;
} = { data: undefined };

const mockSkillGraphQuery: { data: SkillGraph | undefined } = {
  data: undefined,
};

vi.mock("../../../hooks/queries", () => ({
  useSkillDetailQuery: () => mockSkillDetailQuery,
  useConfigQuery: () => mockConfigQuery,
  useSkillGraphQuery: () => mockSkillGraphQuery,
  revalidateConfig: vi.fn(),
  revalidateSkillGraph: vi.fn(),
  revalidateSkillDetail: vi.fn(),
}));

const mockPatchConfig = vi.fn().mockResolvedValue({});
vi.mock("../../../utils/api", () => ({
  patchConfig: (...args: unknown[]) => mockPatchConfig(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = { skillName: "my-skill" };
  mockSearchParams = new URLSearchParams();
  mockLocationState = null;
  mockSkillDetailQuery.data = undefined;
  mockSkillDetailQuery.error = undefined;
  mockSkillDetailQuery.isLoading = false;
  mockConfigQuery.data = undefined;
  mockSkillGraphQuery.data = undefined;
});

describe("useSkillDetailPage", () => {
  describe("derived category options", () => {
    it("includes Uncategorized, category names, and Create option", () => {
      mockConfigQuery.data = {
        config: {
          skill_graph: {
            categories: {
              frontend: { skills: ["react"] },
              backend: { skills: ["node"] },
            },
          },
        } as Partial<WeaverConfig>,
        warnings: [],
      };

      const { result } = renderHook(() => useSkillDetailPage());

      expect(result.current.state.categoryOptions).toEqual([
        { label: "Uncategorized", value: "__uncategorized__" },
        { label: "frontend", value: "frontend" },
        { label: "backend", value: "backend" },
        { label: "+ Create new category", value: "__create_new__" },
      ]);
    });

    it("returns only Uncategorized and Create when no config", () => {
      const { result } = renderHook(() => useSkillDetailPage());

      expect(result.current.state.categoryOptions).toEqual([
        { label: "Uncategorized", value: "__uncategorized__" },
        { label: "+ Create new category", value: "__create_new__" },
      ]);
    });
  });

  describe("name collision detection", () => {
    it("returns true when multiple nodes share the skill name", () => {
      mockSkillGraphQuery.data = {
        nodes: [
          {
            id: "1",
            name: "a",
            skillName: "my-skill",
            description: "",
            category: null,
            source: "global",
            project: null,
          },
          {
            id: "2",
            name: "b",
            skillName: "my-skill",
            description: "",
            category: null,
            source: "workspace",
            project: "p",
          },
        ],
        edges: [],
      };

      const { result } = renderHook(() => useSkillDetailPage());
      expect(result.current.state.hasNameCollision).toBe(true);
    });

    it("returns false when only one node has the skill name", () => {
      mockSkillGraphQuery.data = {
        nodes: [
          {
            id: "1",
            name: "a",
            skillName: "my-skill",
            description: "",
            category: null,
            source: "global",
            project: null,
          },
          {
            id: "2",
            name: "b",
            skillName: "other",
            description: "",
            category: null,
            source: "global",
            project: null,
          },
        ],
        edges: [],
      };

      const { result } = renderHook(() => useSkillDetailPage());
      expect(result.current.state.hasNameCollision).toBe(false);
    });
  });

  describe("selectedCategory", () => {
    it("uses data.category when available", () => {
      mockSkillDetailQuery.data = {
        frontmatter: {},
        body: "",
        source: "global",
        category: "frontend",
        project: null,
      };

      const { result } = renderHook(() => useSkillDetailPage());
      expect(result.current.state.selectedCategory).toBe("frontend");
    });

    it("defaults to __uncategorized__ when no category", () => {
      mockSkillDetailQuery.data = {
        frontmatter: {},
        body: "",
        source: "global",
        category: null,
        project: null,
      };

      const { result } = renderHook(() => useSkillDetailPage());
      expect(result.current.state.selectedCategory).toBe("__uncategorized__");
    });
  });

  describe("breadcrumbs", () => {
    it("shows Skills breadcrumb when no referrer", () => {
      const { result } = renderHook(() => useSkillDetailPage());

      expect(result.current.state.breadcrumbs).toEqual([
        { text: "Skills", href: "/skills" },
        { text: "my-skill", href: "#" },
      ]);
    });

    it("shows Sessions breadcrumb when navigated from a session", () => {
      mockLocationState = { from: "/sessions/abc-123" };

      const { result } = renderHook(() => useSkillDetailPage());

      expect(result.current.state.breadcrumbs).toEqual([
        { text: "Sessions", href: "/" },
        { text: "Session", href: "/sessions/abc-123" },
        { text: "my-skill", href: "#" },
      ]);
    });

    it("includes project in queryString", () => {
      mockSearchParams = new URLSearchParams("project=my-app");

      const { result } = renderHook(() => useSkillDetailPage());
      expect(result.current.state.queryString).toBe("?project=my-app");
    });
  });

  describe("handleCategoryChange", () => {
    it("calls patchConfig with updated categories", async () => {
      mockConfigQuery.data = {
        config: {
          skill_graph: {
            categories: {
              frontend: { skills: [] },
              backend: { skills: ["my-skill"] },
            },
          },
        } as Partial<WeaverConfig>,
        warnings: [],
      };

      const { result } = renderHook(() => useSkillDetailPage());

      await act(() => result.current.actions.handleCategoryChange("frontend"));

      expect(mockPatchConfig).toHaveBeenCalledWith({
        skill_graph: {
          categories: {
            frontend: { skills: ["my-skill"] },
            backend: { skills: [] },
          },
        },
      });
    });

    it("opens create modal when CREATE_NEW selected", async () => {
      const { result } = renderHook(() => useSkillDetailPage());

      await act(() =>
        result.current.actions.handleCategoryChange("__create_new__"),
      );

      expect(result.current.state.showCreateModal).toBe(true);
    });
  });

  describe("handleCreateCategory", () => {
    it("creates category with skill and patches config", async () => {
      mockConfigQuery.data = {
        config: {
          skill_graph: {
            categories: {
              existing: { skills: ["my-skill"] },
            },
          },
        } as Partial<WeaverConfig>,
        warnings: [],
      };

      const { result } = renderHook(() => useSkillDetailPage());

      await act(() =>
        result.current.actions.handleCreateCategory("new-cat", "red"),
      );

      expect(mockPatchConfig).toHaveBeenCalledWith({
        skill_graph: {
          categories: {
            existing: { skills: [] },
            "new-cat": { color: "red", skills: ["my-skill"] },
          },
        },
      });
    });
  });

  describe("not-found redirect", () => {
    it("calls navigate when error includes 'not found'", () => {
      mockSkillDetailQuery.error = new Error("Skill not found");

      renderHook(() => useSkillDetailPage());

      expect(mockNavigate).toHaveBeenCalledWith("/skills", { replace: true });
    });

    it("sets redirecting to true", () => {
      mockSkillDetailQuery.error = new Error("Skill not found");

      const { result } = renderHook(() => useSkillDetailPage());

      expect(result.current.state.redirecting).toBe(true);
    });

    it("does not redirect for other errors", () => {
      mockSkillDetailQuery.error = new Error("Network error");

      const { result } = renderHook(() => useSkillDetailPage());

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(result.current.state.redirecting).toBe(false);
    });
  });
});
