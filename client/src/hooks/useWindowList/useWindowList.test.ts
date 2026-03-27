import { renderHook } from "@testing-library/react";
import { SWRWrapper } from "../../__tests__/helpers/swr-wrapper";
import { useWindowList } from "./useWindowList";

const mockUseSessionsQuery = vi.fn();
const mockUseSkillGraphQuery = vi.fn();

vi.mock("../queries", () => ({
  useSessionsQuery: (...args: unknown[]) => mockUseSessionsQuery(...args),
  useSkillGraphQuery: (...args: unknown[]) => mockUseSkillGraphQuery(...args),
}));

describe("useWindowList", () => {
  beforeEach(() => {
    mockUseSessionsQuery.mockReturnValue({ data: [] });
    mockUseSkillGraphQuery.mockReturnValue({ data: undefined });
  });

  it("returns static windows when no sessions or skills", () => {
    const { result } = renderHook(() => useWindowList(), {
      wrapper: SWRWrapper,
    });
    expect(result.current).toHaveLength(4);
    expect(result.current.map((w) => w.label)).toEqual([
      "Sessions",
      "Skills",
      "Cherry Pick",
      "Settings",
    ]);
  });

  it("includes open sessions", () => {
    mockUseSessionsQuery.mockReturnValue({
      data: [
        {
          id: "abc",
          status: "open",
          pid: 123,
          cwd: "/home/user/project",
          customName: "My Session",
          agentName: null,
          startTime: "",
          lastEventTime: "",
        },
      ],
    });

    const { result } = renderHook(() => useWindowList(), {
      wrapper: SWRWrapper,
    });
    const session = result.current.find((w) => w.label === "My Session");
    expect(session).toBeDefined();
    expect(session!.href).toBe("/sessions/abc");
    expect(session!.description).toContain("PID 123");
  });

  it("excludes closed sessions", () => {
    mockUseSessionsQuery.mockReturnValue({
      data: [
        {
          id: "abc",
          status: "closed",
          pid: 123,
          cwd: "/project",
          customName: "Closed",
          agentName: null,
          startTime: "",
          lastEventTime: "",
        },
      ],
    });

    const { result } = renderHook(() => useWindowList(), {
      wrapper: SWRWrapper,
    });
    expect(result.current).toHaveLength(4);
  });

  it("includes skill nodes", () => {
    mockUseSkillGraphQuery.mockReturnValue({
      data: {
        nodes: [
          {
            id: "1",
            name: "coding-practices",
            skillName: "coding-practices",
            description: "",
            source: "global",
            project: null,
            category: "core",
          },
        ],
        edges: [],
      },
    });

    const { result } = renderHook(() => useWindowList(), {
      wrapper: SWRWrapper,
    });
    const skill = result.current.find(
      (w) => w.label === "Skill: coding-practices",
    );
    expect(skill).toBeDefined();
    expect(skill!.href).toContain("/skills/coding-practices");
  });

  it("appends (global) suffix for duplicate skill names", () => {
    mockUseSkillGraphQuery.mockReturnValue({
      data: {
        nodes: [
          {
            id: "1",
            name: "coding-practices",
            skillName: "coding-practices",
            description: "",
            source: "workspace",
            project: "my-project",
            category: "core",
          },
          {
            id: "2",
            name: "coding-practices",
            skillName: "coding-practices",
            description: "",
            source: "global",
            project: null,
            category: "core",
          },
        ],
        edges: [],
      },
    });

    const { result } = renderHook(() => useWindowList(), {
      wrapper: SWRWrapper,
    });
    const globalSkill = result.current.find(
      (w) => w.label === "Skill: coding-practices (global)",
    );
    const workspaceSkill = result.current.find(
      (w) => w.label === "Skill: coding-practices (my-project)",
    );
    expect(globalSkill).toBeDefined();
    expect(workspaceSkill).toBeDefined();
  });
});
