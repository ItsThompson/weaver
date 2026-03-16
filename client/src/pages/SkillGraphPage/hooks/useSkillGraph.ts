import { useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import dagre from "dagre";
import { useSkillGraphQuery, useConfigQuery } from "../../../hooks/queries";
import { useCategoryColors } from "./useCategoryColors";
import type { SkillNodeData } from "../types";

export function useSkillGraph() {
  const { data, error, isLoading } = useSkillGraphQuery();
  const { data: configData } = useConfigQuery();
  const resolveColor = useCategoryColors(configData);

  const { nodes, edges } = useMemo(() => {
    if (!data) {
      return { nodes: [] as Node<SkillNodeData>[], edges: [] as Edge[] };
    }

    const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 50 });

    const nodeWidth = 200;
    const nodeHeight = 50;

    data.nodes.forEach((node) =>
      g.setNode(node.name, { width: nodeWidth, height: nodeHeight }),
    );
    data.edges.forEach((edge) => g.setEdge(edge.from, edge.to));
    dagre.layout(g);

    const nodes: Node<SkillNodeData>[] = data.nodes.map((skill) => {
      const pos = g.node(skill.name);
      return {
        id: skill.name,
        type: "skill",
        position: {
          x: pos.x - nodeWidth / 2,
          y: pos.y - nodeHeight / 2,
        },
        data: {
          label: skill.name,
          category: skill.category,
          description: skill.description,
          source: skill.source,
          project: skill.project,
          variants: skill.variants,
          color: resolveColor(skill.category),
        },
      };
    });

    const edges: Edge[] = data.edges.map((edge, index) => ({
      id: `e-${index}`,
      source: edge.from,
      target: edge.to,
      style: { strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed },
    }));

    return { nodes, edges };
  }, [data, resolveColor]);

  return { nodes, edges, isLoading, error };
}
