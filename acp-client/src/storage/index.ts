import type { WeaverDb } from '@weaver/shared/db';
import type { ContentChunk, ToolCall, ToolCallUpdate } from '@agentclientprotocol/sdk';

function extractText(chunk: ContentChunk): string {
  const block = chunk.content;
  if ('text' in block && typeof block.text === 'string') return block.text;
  return JSON.stringify(block);
}

export function persistMessageChunk(
  db: WeaverDb,
  internalSessionId: string,
  chunk: ContentChunk,
  role: 'user' | 'assistant',
): number {
  return db.appendMessage({
    session_id: internalSessionId,
    role,
    type: 'text',
    content: extractText(chunk),
    metadata: null,
    created_at: new Date().toISOString(),
  });
}

export function persistToolCall(
  db: WeaverDb,
  internalSessionId: string,
  toolCall: ToolCall,
): void {
  db.upsertToolCall({
    id: toolCall.toolCallId,
    session_id: internalSessionId,
    message_id: null,
    tool_name: toolCall.title,
    kind: toolCall.kind ?? null,
    status: toolCall.status ?? 'pending',
    input: toolCall.rawInput != null ? JSON.stringify(toolCall.rawInput) : null,
    output: null,
    permission_response: null,
    started_at: new Date().toISOString(),
    completed_at: null,
  });
}

export function persistToolCallUpdate(
  db: WeaverDb,
  internalSessionId: string,
  update: ToolCallUpdate,
): void {
  db.upsertToolCall({
    id: update.toolCallId,
    session_id: internalSessionId,
    message_id: null,
    tool_name: update.title ?? update.toolCallId,
    kind: null,
    status: update.status ?? 'in_progress',
    input: null,
    output: update.content != null ? JSON.stringify(update.content) : null,
    permission_response: null,
    started_at: new Date().toISOString(),
    completed_at: update.status === 'completed' || update.status === 'failed' ? new Date().toISOString() : null,
  });
}

export function persistEvent(
  db: WeaverDb,
  internalSessionId: string,
  eventType: string,
  data?: unknown,
): void {
  db.appendEvent({
    session_id: internalSessionId,
    event_type: eventType,
    data: data != null ? JSON.stringify(data) : null,
    created_at: new Date().toISOString(),
  });
}
