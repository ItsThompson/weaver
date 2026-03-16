import React from "react";
import { renderHook } from "@testing-library/react";
import { SWRConfig } from "swr";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

import "../../../__tests__/mocks/api";
import { TEST_SKILL_GRAPH } from "../../../__tests__/fixtures/skills";

import * as api from "../../../utils/api";
import { useSkillGraph } from "./useSkillGraph";

const mockGetSkillGraph = vi.mocked(api.getSkillGraph);
const mockGetConfig = vi.mocked(api.getConfig);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, {
    value: { provider: () => new Map(), dedupingInterval: 0 },
    children,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfig.mockResolvedValue({
    config: {
      ...DEFAULT_CONFIG,
      skill_graph: {
        categories: {
          language: { color: "#4ecdc4", skills: ["typescript"] },
          domain: { color: "#45b7d1", skills: ["react"] },
        },
      },
    },
    warnings: [],
  });
});

describe("useSkillGraph", () => {
  it("returns loading state initially", () => {
    mockGetSkillGraph.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSkillGraph(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });

  it("uses composite ids from API for node ids and dagre layout", async () => {
    mockGetSkillGraph.mockResolvedValue(TEST_SKILL_GRAPH);
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.nodes.length).toBe(2);
    });

    const tsNode = result.current.nodes.find(
      (node) => node.id === "typescript::my-app",
    );
    const reactNode = result.current.nodes.find(
      (node) => node.id === "react::global",
    );
    expect(tsNode).toBeDefined();
    expect(reactNode).toBeDefined();
  });

  it("includes skillName and project in node data", async () => {
    mockGetSkillGraph.mockResolvedValue(TEST_SKILL_GRAPH);
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.nodes.length).toBe(2);
    });

    const tsNode = result.current.nodes.find(
      (node) => node.id === "typescript::my-app",
    );
    expect(tsNode?.data.skillName).toBe("typescript");
    expect(tsNode?.data.project).toBe("my-app");
  });

  it("formats label with project suffix for workspace skills", async () => {
    mockGetSkillGraph.mockResolvedValue(TEST_SKILL_GRAPH);
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.nodes.length).toBe(2);
    });

    const tsNode = result.current.nodes.find(
      (node) => node.id === "typescript::my-app",
    );
    expect(tsNode?.data.label).toBe("typescript (my-app)");
  });

  it("appends (global) only when name collision exists", async () => {
    mockGetSkillGraph.mockResolvedValue(TEST_SKILL_GRAPH);
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.nodes.length).toBe(2);
    });

    // react is global-only, no collision with workspace
    const reactNode = result.current.nodes.find(
      (node) => node.id === "react::global",
    );
    expect(reactNode?.data.label).toBe("react");
  });

  it("appends (global) when workspace skill has same name", async () => {
    const graphWithCollision = {
      nodes: [
        {
          ...TEST_SKILL_GRAPH.nodes[0],
          id: "react::my-app",
          skillName: "react",
          name: "react",
          source: "workspace" as const,
          project: "my-app",
        },
        { ...TEST_SKILL_GRAPH.nodes[1] },
      ],
      edges: [],
    };
    mockGetSkillGraph.mockResolvedValue(graphWithCollision);
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.nodes.length).toBe(2);
    });

    const globalReact = result.current.nodes.find(
      (node) => node.id === "react::global",
    );
    expect(globalReact?.data.label).toBe("react (global)");
  });

  it("maps edges using composite ids from API", async () => {
    mockGetSkillGraph.mockResolvedValue(TEST_SKILL_GRAPH);
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.edges.length).toBe(1);
    });

    expect(result.current.edges[0]).toMatchObject({
      source: "typescript::my-app",
      target: "react::global",
    });
  });

  it("returns empty arrays when API returns empty graph", async () => {
    mockGetSkillGraph.mockResolvedValue({ nodes: [], edges: [] });
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });

  it("passes error state through from SWR", async () => {
    mockGetSkillGraph.mockRejectedValue(new Error("fetch failed"));
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.isLoading).toBe(false);
  });
});
