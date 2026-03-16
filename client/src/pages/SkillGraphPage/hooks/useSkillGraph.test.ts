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

  it("transforms API data into positioned React Flow nodes", async () => {
    mockGetSkillGraph.mockResolvedValue(TEST_SKILL_GRAPH);
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.nodes.length).toBe(2);
    });

    for (const node of result.current.nodes) {
      expect(node.position).toHaveProperty("x");
      expect(node.position).toHaveProperty("y");
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
      expect(node.type).toBe("skill");
    }

    const tsNode = result.current.nodes.find((n) => n.id === "typescript");
    expect(tsNode?.data.label).toBe("typescript");
    expect(tsNode?.data.category).toBe("language");
  });

  it("maps edges from SkillEdge to React Flow Edge format", async () => {
    mockGetSkillGraph.mockResolvedValue(TEST_SKILL_GRAPH);
    const { result } = renderHook(() => useSkillGraph(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.edges.length).toBe(1);
    });

    expect(result.current.edges[0]).toMatchObject({
      source: "typescript",
      target: "react",
    });
    expect(result.current.edges[0].markerEnd).toBeDefined();
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
