import React from "react";
import { renderHook } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { SkillGraph } from "@weaver/shared/types";
import { SkillCategory } from "@weaver/shared/types";

import "../../../__tests__/mocks/api";

import * as api from "../../../utils/api";
import { useSkillGraph } from "./useSkillGraph";

const mockGetSkillGraph = vi.mocked(api.getSkillGraph);

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, {
    value: { provider: () => new Map(), dedupingInterval: 0 },
    children,
  });
}

beforeEach(() => vi.clearAllMocks());

const testGraph: SkillGraph = {
  nodes: [
    {
      name: "typescript",
      description: "TS lang",
      category: SkillCategory.LANGUAGE,
      source: "workspace",
    },
    {
      name: "react",
      description: "React lib",
      category: SkillCategory.DOMAIN,
      source: "global",
    },
  ],
  edges: [{ from: "typescript", to: "react" }],
};

describe("useSkillGraph", () => {
  it("returns loading state initially", () => {
    mockGetSkillGraph.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSkillGraph(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });

  it("transforms API data into positioned React Flow nodes", async () => {
    mockGetSkillGraph.mockResolvedValue(testGraph);
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
    expect(tsNode?.data.category).toBe(SkillCategory.LANGUAGE);
  });

  it("maps edges from SkillEdge to React Flow Edge format", async () => {
    mockGetSkillGraph.mockResolvedValue(testGraph);
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
