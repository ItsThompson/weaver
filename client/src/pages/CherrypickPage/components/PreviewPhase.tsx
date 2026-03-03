import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import type { ParsedConversation, SavedConversation, ConversationExchange } from '@weaver/shared/types';
import { parseConversation } from '../../../utils/conversation-parser';
import { ExchangeSummaryLine } from './ExchangeSummaryLine';

interface PreviewPhaseProps {
  parsed: ParsedConversation;
  pruned: SavedConversation;
  deleteMainIds: Set<number>;
  deleteTangentIds: Set<number>;
  totalSelected: number;
  onBack: () => void;
  onDownload: () => void;
}

function countTurns(exchanges: ConversationExchange[], selectedIds: Set<number>): number {
  return exchanges
    .filter((ex) => selectedIds.has(ex.id))
    .reduce((sum, ex) => sum + ex.turns.length, 0);
}

export function PreviewPhase({ parsed, pruned, deleteMainIds, deleteTangentIds, totalSelected, onBack, onDownload }: PreviewPhaseProps) {
  const removedTurnCount = countTurns(parsed.mainExchanges, deleteMainIds)
    + countTurns(parsed.tangentExchanges ?? [], deleteTangentIds);

  const prunedParsed = parseConversation(pruned);

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onBack}>Back</Button>
            <Button variant="primary" onClick={onDownload}>Download pruned JSON</Button>
          </SpaceBetween>
        }
      >
        Preview
      </Header>

      <Alert type="info">
        Removing {totalSelected} exchange(s) ({removedTurnCount} turns).
        Remaining: {pruned.history.length} turns.
      </Alert>

      <Container header={<Header variant="h2">Remaining exchanges</Header>}>
        {pruned.history.length === 0 ? (
          <Box color="text-body-secondary">All exchanges removed — conversation will be empty.</Box>
        ) : (
          <SpaceBetween size="s">
            {prunedParsed.mainExchanges.map((ex) => (
              <ExchangeSummaryLine key={`main-${ex.id}`} label="Main" exchange={ex} />
            ))}
            {prunedParsed.tangentExchanges?.map((ex) => (
              <ExchangeSummaryLine key={`tangent-${ex.id}`} label="Tangent" exchange={ex} />
            ))}
          </SpaceBetween>
        )}
      </Container>

      <Container header={<Header variant="h2">Updated transcript</Header>}>
        <Box variant="pre" fontSize="body-s">
          {pruned.transcript.map((line, i) => `[${i}] ${line}`).join('\n')}
        </Box>
      </Container>
    </SpaceBetween>
  );
}
