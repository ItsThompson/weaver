import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { SkillNodeData } from "../types";
import { colors } from "../../../theme/colors";
import { Link } from "react-router-dom";

type SkillFlowNode = Node<SkillNodeData, "skill">;

const WORKSPACE_BG = "#1a2332";

export function SkillNode({ data }: NodeProps<SkillFlowNode>) {
  const background =
    data.source === "workspace"
      ? WORKSPACE_BG
      : `var(--color-background-container-content, ${colors.backgroundContainer})`;

  const query =
    data.project !== null
      ? `?project=${encodeURIComponent(data.project)}`
      : `?source=global`;

  return (
    <Link
      to={`/skills/${data.skillName}${query}`}
      style={{
        display: "block",
        padding: "8px 12px",
        borderLeft: `4px solid ${data.color}`,
        background,
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
