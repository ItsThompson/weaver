import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import type { TurnGroup } from '@shared/types';
import { ToolCallCard } from '../../../components/ToolCallCard';

export function TurnContainer({ turn }: { turn: TurnGroup }) {
  const firstEvent = turn.events[0]?.event.hook_event_name;

  if (firstEvent === 'agentSpawn') {
    return (
      <Box textAlign="center" margin={{ vertical: 's' }}>
        <Badge color="grey">Session started</Badge>
        <Box fontSize="body-s" color="text-body-secondary">{new Date(turn.startTime).toLocaleString()}</Box>
      </Box>
    );
  }

  return (
    <Container
      header={
        <Header
          variant="h3"
          description={new Date(turn.startTime).toLocaleString()}
          counter={turn.toolCalls.length > 0 ? `${turn.toolCalls.length} tool call${turn.toolCalls.length > 1 ? 's' : ''}` : undefined}
        >
          Turn {turn.id}
        </Header>
      }
    >
      <SpaceBetween size="m">
        {turn.userPrompt && (
          <Box>
            <Box fontSize="body-s" fontWeight="bold" color="text-label">User prompt</Box>
            <Box variant="p">{turn.userPrompt}</Box>
          </Box>
        )}
        {turn.toolCalls.map((tc, i) => (
          <ToolCallCard key={`${tc.toolName}-${i}`} toolCall={tc} />
        ))}
        {!turn.userPrompt && turn.toolCalls.length === 0 && (
          <Box color="text-status-inactive" fontSize="body-s">No hook data captured for this turn</Box>
        )}
      </SpaceBetween>
    </Container>
  );
}