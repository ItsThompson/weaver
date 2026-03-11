import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Badge from "@cloudscape-design/components/badge";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import type { TurnGroup } from "@weaver/shared/types";
import { ToolCallCard } from "../../../components/ToolCallCard";
import { ValidationBanner } from "../../../components/ValidationBanner";

interface TurnContainerProps {
  turn: TurnGroup;
  showTools: boolean;
  onToggleTools?: () => void;
}

export function TurnContainer({
  turn,
  showTools,
  onToggleTools,
}: TurnContainerProps) {
  const firstEvent = turn.events[0]?.event.hook_event_name;

  if (firstEvent === "agentSpawn") {
    return (
      <Container
        header={
          <Header
            variant="h3"
            description={new Date(turn.startTime).toLocaleString()}
          >
            Turn {turn.id}
          </Header>
        }
      >
        <Badge color="grey">Session started</Badge>
      </Container>
    );
  }

  const hasTools = turn.toolCalls.length > 0;

  return (
    <Container
      header={
        <Header
          variant="h3"
          description={new Date(turn.startTime).toLocaleString()}
          counter={
            hasTools
              ? `${turn.toolCalls.length} tool call${turn.toolCalls.length > 1 ? "s" : ""}`
              : undefined
          }
        >
          Turn {turn.id}
        </Header>
      }
    >
      <SpaceBetween size="m">
        {turn.userPrompt && (
          <Box>
            <Box fontSize="body-s" fontWeight="bold" color="text-label">
              User prompt
            </Box>
            <Box variant="p">{turn.userPrompt}</Box>
          </Box>
        )}
        {hasTools &&
          showTools &&
          turn.toolCalls.map((tc, i) => (
            <ToolCallCard key={`${tc.toolName}-${i}`} toolCall={tc} />
          ))}
        {turn.validationResults.length > 0 && (
          <ValidationBanner results={turn.validationResults} />
        )}
        {hasTools && onToggleTools && (
          <Button variant="inline-link" onClick={onToggleTools}>
            {showTools
              ? "Hide tool calls"
              : `Show ${turn.toolCalls.length} tool call${turn.toolCalls.length > 1 ? "s" : ""}`}
          </Button>
        )}
        {!turn.userPrompt && !hasTools && (
          <Box color="text-status-inactive" fontSize="body-s">
            No hook data captured for this turn
          </Box>
        )}
      </SpaceBetween>
    </Container>
  );
}
