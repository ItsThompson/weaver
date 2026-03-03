import type { ConversationExchange } from '@weaver/shared/types';

export interface ExchangeCardProps {
  exchange: ConversationExchange;
  selected: boolean;
  onToggle: (id: number) => void;
}
