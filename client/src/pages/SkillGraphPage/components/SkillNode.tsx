import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { SkillNodeData } from "../types";
import { CATEGORY_COLORS, colors } from "../../../theme/colors";
import { Link } from "react-router-dom";

type SkillFlowNode = Node<SkillNodeData, "skill">;

export function SkillNode({ data }: NodeProps<SkillFlowNode>) {
  const color =
    data.source === "workspace"
      ? colors.neutral
      : (CATEGORY_COLORS[data.category] ?? colors.neutral);

  return (
    <Link
      to={`/skills/${data.label}`}
      style={{
        display: "block",
        padding: "8px 12px",
        borderLeft: `4px solid ${color}`,
        background: `var(--color-background-container-content, ${colors.backgroundContainer})`,
        borderRadius: 4,
        cursor: "pointer",
        color: `var(--color-text-body-default, ${colors.textPrimary})`,
        fontSize: "var(--font-size-body-m, 14px)",
        fontFamily: "var(--font-family-base, 'Open Sans', sans-serif)",
        minWidth: 140,
        textDecoration: "none",
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </Link>
  );
}
