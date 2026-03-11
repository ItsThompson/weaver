import type { ConversationExchange } from "../../types/conversation";

export interface ExchangeCardProps {
  exchange: ConversationExchange;
  selected: boolean;
  onToggle: (id: number) => void;
}
