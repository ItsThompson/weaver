import SpaceBetween from '@cloudscape-design/components/space-between';
import Header from '@cloudscape-design/components/header';
import Checkbox from '@cloudscape-design/components/checkbox';
import type { ConversationExchange } from '../../../types/conversation';
import { ExchangeCard } from '../../../components/ExchangeCard';

interface ExchangeSectionProps {
  title: string;
  exchanges: ConversationExchange[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
}

export function ExchangeSection({ title, exchanges, selectedIds, onToggle, onToggleAll }: ExchangeSectionProps) {
  const allSelected = exchanges.length > 0 && exchanges.every((ex) => selectedIds.has(ex.id));

  return (
    <SpaceBetween size="s">
      <Header
        variant="h2"
        actions={
          <Checkbox checked={allSelected} onChange={onToggleAll}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </Checkbox>
        }
      >
        {title} ({selectedIds.size} of {exchanges.length} selected)
      </Header>
      {exchanges.map((ex) => (
        <ExchangeCard key={ex.id} exchange={ex} selected={selectedIds.has(ex.id)} onToggle={onToggle} />
      ))}
    </SpaceBetween>
  );
}
