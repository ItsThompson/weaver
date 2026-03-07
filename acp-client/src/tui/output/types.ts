import type { PlanEntry } from '@agentclientprotocol/sdk';

export interface ToolCallDisplay {
  toolCallId: string;
  title: string;
  kind: string;
  status: string;
}

export interface OutputController {
  writeChunk(text: string): void;
  endMessage(): void;
  showToolCall(toolCall: ToolCallDisplay): void;
  updateToolCall(toolCallId: string, status: string, content?: string): void;
  showPlan(entries: PlanEntry[]): void;
  showSystem(message: string): void;
  showError(message: string): void;
  clear(): void;
}
