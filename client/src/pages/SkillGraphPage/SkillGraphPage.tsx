import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { useSkillGraph } from "./hooks/useSkillGraph";
import { SkillNode } from "./components/SkillNode";
import { GraphControls } from "./components/GraphControls";
import { ZoomControls } from "./components/ZoomControls";

const nodeTypes = { skill: SkillNode };

function SkillGraph() {
  const { nodes, edges, isLoading, error } = useSkillGraph();

  if (isLoading) {
    return <Spinner size="large" />;
  }
  if (error) {
    return <Box color="text-status-error">{error.message}</Box>;
  }

  return (
    <div style={{ height: "100vh", position: "relative" }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView />
      <GraphControls />
      <ZoomControls />
    </div>
  );
}

export function SkillGraphPage() {
  return (
    <ReactFlowProvider>
      <SkillGraph />
    </ReactFlowProvider>
  );
}
