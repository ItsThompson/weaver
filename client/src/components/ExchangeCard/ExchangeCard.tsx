import Container from '@cloudscape-design/components/container';
import Checkbox from '@cloudscape-design/components/checkbox';
import Header from '@cloudscape-design/components/header';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import { PROMPT_PREVIEW_LEN, RESPONSE_PREVIEW_LEN } from './constants';
import type { ExchangeCardProps } from './types';

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max) + '…', truncated: true };
}

export function ExchangeCard({ exchange, selected, onToggle }: ExchangeCardProps) {
  const prompt = truncate(exchange.userPrompt, PROMPT_PREVIEW_LEN);
  const response = truncate(exchange.assistantResponse, RESPONSE_PREVIEW_LEN);

  return (
    <Container
      header={
        <Header
          variant="h3"
          actions={
            <Checkbox checked={selected} onChange={() => onToggle(exchange.id)}>
              Delete
            </Checkbox>
          }
        >
          Exchange {exchange.id}
          {exchange.timestamp && (
            <Box variant="span" fontSize="body-s" color="text-body-secondary" padding={{ left: 's' }}>
              {new Date(exchange.timestamp).toLocaleTimeString()}
            </Box>
          )}
        </Header>
      }
    >
      <Box variant="p" color="text-body-secondary">
        <Box variant="strong">Prompt: </Box>
        {prompt.text}
        {prompt.truncated && (
          <ExpandableSection headerText="Show full prompt" variant="footer">
            {exchange.userPrompt}
          </ExpandableSection>
        )}
      </Box>

      {exchange.toolsUsed.length > 0 && (
        <Box padding={{ top: 'xs' }}>
          {exchange.toolsUsed.map((tool, i) => (
            <Badge key={i} color="blue">{tool}</Badge>
          ))}
        </Box>
      )}

      <Box padding={{ top: 'xs' }} variant="p">
        <Box variant="strong">Response: </Box>
        {response.text}
        {response.truncated && (
          <ExpandableSection headerText="Show full response" variant="footer">
            {exchange.assistantResponse}
          </ExpandableSection>
        )}
      </Box>
    </Container>
  );
}
