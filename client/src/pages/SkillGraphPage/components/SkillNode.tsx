import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { Link } from "react-router-dom";
import Popover from "@cloudscape-design/components/popover";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { SkillNodeData } from "../types";
import { colors } from "../../../theme/colors";

type SkillFlowNode = Node<SkillNodeData, "skill">;

const WORKSPACE_BG = "#1a2332";

export function SkillNode({ data }: NodeProps<SkillFlowNode>) {
  const background =
    data.source === "workspace"
      ? WORKSPACE_BG
      : `var(--color-background-container-content, ${colors.backgroundContainer})`;

  const nodeStyle = {
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
  };

  const nodeContent = (
    <>
      <Handle type="target" position={Position.Left} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </>
  );

  if (data.variants.length <= 1) {
    return (
      <Link to={`/skills/${data.label}`} style={nodeStyle}>
        {nodeContent}
      </Link>
    );
  }

  return (
    <Popover
      renderWithPortal
      triggerType="custom"
      content={
        <SpaceBetween size="xs">
          {data.variants.map((variant) => {
            const label = variant.project ?? "Global";
            const query = variant.project
              ? `?project=${variant.project}`
              : "?source=global";
            return (
              <Link key={label} to={`/skills/${data.label}${query}`}>
                {label}
              </Link>
            );
          })}
        </SpaceBetween>
      }
    >
      <div style={nodeStyle}>{nodeContent}</div>
    </Popover>
  );
}
