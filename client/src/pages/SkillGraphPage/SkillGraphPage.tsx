import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { useSkillGraph } from "./hooks/useSkillGraph";
import { SkillNode } from "./components/SkillNode";
import { GraphControls } from "./components/GraphControls";

const nodeTypes = { skill: SkillNode };

export function SkillGraphPage() {
  const { nodes, edges, isLoading, error } = useSkillGraph();

  if (isLoading) {
    return <Spinner size="large" />;
  }
  if (error) {
    return <Box color="text-status-error">{error.message}</Box>;
  }

  return (
    <div style={{ height: "calc(100vh - 120px)", position: "relative" }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
      </ReactFlow>
      <GraphControls />
    </div>
  );
}
