import { useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import dagre from "dagre";
import { useSkillGraphQuery } from "../../../hooks/queries";
import type { SkillNodeData } from "../types";

export function useSkillGraph() {
  const { data, error, isLoading } = useSkillGraphQuery();

  const { nodes, edges } = useMemo(() => {
    if (!data) {
      return { nodes: [] as Node<SkillNodeData>[], edges: [] as Edge[] };
    }

    const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 50 });

    for (const node of data.nodes) {
      g.setNode(node.name, { width: 180, height: 60 });
    }
    for (const edge of data.edges) {
      g.setEdge(edge.from, edge.to);
    }
    dagre.layout(g);

    const nodes: Node<SkillNodeData>[] = data.nodes.map((skill) => {
      const pos = g.node(skill.name);
      return {
        id: skill.name,
        type: "skill",
        position: { x: pos.x - 90, y: pos.y - 30 },
        data: {
          label: skill.name,
          category: skill.category,
          description: skill.description,
        },
      };
    });

    const edges: Edge[] = data.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
    }));

    return { nodes, edges };
  }, [data]);

  return { nodes, edges, isLoading, error };
}
