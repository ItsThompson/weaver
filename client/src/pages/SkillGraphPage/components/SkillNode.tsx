import { useNavigate } from "react-router-dom";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { SkillNodeData } from "../types";
import { SkillCategory } from "@weaver/shared/types";

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  [SkillCategory.CORE]: "#ff6b6b",
  [SkillCategory.LANGUAGE]: "#4ecdc4",
  [SkillCategory.DOMAIN]: "#45b7d1",
  [SkillCategory.WORKFLOW]: "#96ceb4",
};

type SkillFlowNode = Node<SkillNodeData, "skill">;

export function SkillNode({ data }: NodeProps<SkillFlowNode>) {
  const navigate = useNavigate();
  const color = CATEGORY_COLORS[data.category] ?? "#888";

  return (
    <div
      onClick={() => navigate(`/skills/${data.label}`)}
      style={{
        padding: "8px 12px",
        borderLeft: `4px solid ${color}`,
        background: "#1a1a2e",
        borderRadius: 4,
        cursor: "pointer",
        color: "#fff",
        fontSize: 13,
        minWidth: 140,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
