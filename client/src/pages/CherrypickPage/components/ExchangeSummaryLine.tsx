import Box from '@cloudscape-design/components/box';
import type { ConversationExchange } from '../../../types/conversation';

export function ExchangeSummaryLine({ label, exchange: ex }: { label: string; exchange: ConversationExchange }) {
  return (
    <Box variant="p">
      <Box variant="strong">[{label}] Exchange {ex.id}: </Box>
      {ex.userPrompt.slice(0, 100)}{ex.userPrompt.length > 100 ? '…' : ''}
      {ex.toolsUsed.length > 0 && <Box variant="span" color="text-body-secondary"> [{ex.toolsUsed.join(', ')}]</Box>}
    </Box>
  );
}
