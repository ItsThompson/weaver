import { useReactFlow } from "@xyflow/react";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";

export function ZoomControls() {
  const { zoomIn, zoomOut } = useReactFlow();

  return (
    <div style={{ position: "absolute", top: 52, right: 12, zIndex: 5 }}>
      <SpaceBetween size="xxs">
        <Button iconName="add-plus" variant="icon" onClick={() => zoomIn()} />
        <Button
          iconName="subtract-minus"
          variant="icon"
          onClick={() => zoomOut()}
        />
      </SpaceBetween>
    </div>
  );
}
