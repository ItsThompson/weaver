import { PENDING_APPROVAL_THRESHOLD_MS } from '@weaver/shared/types';
import type { HookEvent, TurnGroup, ToolCallPair, ToolCallDetail, ActivityStatus } from '@weaver/shared/types';
import type { MessageRow, ToolCallRow } from '@weaver/shared/db';
import { getDb } from '../storage/index';

export function deriveActivity(eventName: string, eventTimestamp?: string): ActivityStatus {
  switch (eventName) {
    case 'agentSpawn': return 'starting';
    case 'stop': return 'idle';
    case 'preToolUse': {
      if (eventTimestamp) {
        const age = Date.now() - new Date(eventTimestamp).getTime();
        if (age > PENDING_APPROVAL_THRESHOLD_MS) return 'pending_approval';
      }
      return 'running_tool';
    }
    default: return 'processing';
  }
}

export async function getLastEvent(sessionId: string): Promise<{ name: string; timestamp: string } | null> {
  const events = getDb().getEvents(sessionId);
  if (events.length === 0) return null;
  const last = events[events.length - 1];
  const nameMap: Record<string, string> = {
    session_start: 'agentSpawn',
    prompt: 'userPromptSubmit',
    tool_call: 'preToolUse',
    tool_result: 'postToolUse',
    turn_end: 'stop',
  };
  return { name: nameMap[last.event_type] ?? last.event_type, timestamp: last.created_at };
}

export async function parseLogFile(sessionId: string): Promise<HookEvent[]> {
  const db = getDb();
  const messages = db.getMessages(sessionId);
  const toolCalls = db.getToolCalls(sessionId);

  const hookEvents: HookEvent[] = [];
  const session = db.getSession(sessionId);
  const cwd = session?.cwd ?? '';

  for (const msg of messages) {
    if (msg.role === 'user' && msg.type === 'text') {
      hookEvents.push({
        timestamp: msg.created_at,
        event: { hook_event_name: 'userPromptSubmit', cwd, prompt: msg.content ?? undefined },
      });
    }
  }

  for (const tc of toolCalls) {
    const input = tc.input ? safeJsonParse(tc.input) : {};
    hookEvents.push({
      timestamp: tc.started_at,
      event: { hook_event_name: 'preToolUse', cwd, tool_name: tc.tool_name, tool_input: input },
    });
    if (tc.completed_at) {
      const output = tc.output ? safeJsonParse(tc.output) : undefined;
      hookEvents.push({
        timestamp: tc.completed_at,
        event: {
          hook_event_name: 'postToolUse',
          cwd,
          tool_name: tc.tool_name,
          tool_input: input,
          tool_response: output ? { success: tc.status === 'completed', result: Array.isArray(output) ? output : [output] } : undefined,
        },
      });
    }
  }

  hookEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return hookEvents;
}

function safeJsonParse(str: string): Record<string, unknown> {
  try { return JSON.parse(str); } catch { return {}; }
}

export function buildTurnsFromSqlite(messages: MessageRow[], toolCalls: ToolCallRow[]): TurnGroup[] {
  const turns: TurnGroup[] = [];
  const tcBySession = new Map<string, ToolCallRow[]>();
  for (const tc of toolCalls) {
    const key = tc.session_id;
    const arr = tcBySession.get(key) ?? [];
    arr.push(tc);
    tcBySession.set(key, arr);
  }

  let currentUserPrompt: string | null = null;
  let currentAssistantChunks: string[] = [];
  let currentToolCalls: ToolCallRow[] = [];
  let turnStart: string | null = null;
  let turnEnd: string | null = null;
  let tcIndex = 0;

  const flush = () => {
    if (!turnStart) return;
    const toolCallDetails: ToolCallDetail[] = currentToolCalls.map((tc) => ({
      id: tc.id,
      toolName: tc.tool_name,
      kind: tc.kind ?? undefined,
      status: tc.status,
      input: tc.input ?? undefined,
      output: tc.output ?? undefined,
      startedAt: tc.started_at,
      completedAt: tc.completed_at ?? undefined,
    }));

    const toolCallPairs: ToolCallPair[] = currentToolCalls.map((tc) => ({
      toolName: tc.tool_name,
      input: tc.input ? safeJsonParse(tc.input) : {},
      response: tc.output ? { success: tc.status === 'completed', result: [safeJsonParse(tc.output)] } : undefined,
      startTime: tc.started_at,
      endTime: tc.completed_at ?? undefined,
    }));

    turns.push({
      id: turns.length,
      userPrompt: currentUserPrompt,
      events: [],
      toolCalls: toolCallPairs,
      startTime: turnStart,
      endTime: turnEnd ?? turnStart,
      assistantContent: currentAssistantChunks.length > 0 ? currentAssistantChunks.join('') : undefined,
      toolCallDetails: toolCallDetails.length > 0 ? toolCallDetails : undefined,
    });

    currentUserPrompt = null;
    currentAssistantChunks = [];
    currentToolCalls = [];
    turnStart = null;
    turnEnd = null;
  };

  const collectToolCalls = (afterTime: string, beforeTime?: string) => {
    while (tcIndex < toolCalls.length) {
      const tc = toolCalls[tcIndex];
      if (tc.started_at < afterTime) { tcIndex++; continue; }
      if (beforeTime && tc.started_at >= beforeTime) break;
      currentToolCalls.push(tc);
      turnEnd = tc.completed_at ?? tc.started_at;
      tcIndex++;
    }
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user' && msg.type === 'text') {
      flush();
      currentUserPrompt = msg.content;
      turnStart = msg.created_at;
      turnEnd = msg.created_at;

      const nextUserTime = findNextUserMessageTime(messages, i + 1);
      collectToolCalls(msg.created_at, nextUserTime);
      continue;
    }

    if (msg.role === 'assistant' && msg.type === 'text' && msg.content) {
      if (!turnStart) {
        turnStart = msg.created_at;
      }
      currentAssistantChunks.push(msg.content);
      turnEnd = msg.created_at;
    }
  }

  flush();

  // Remaining tool calls not associated with any user message
  while (tcIndex < toolCalls.length) {
    const tc = toolCalls[tcIndex];
    currentToolCalls.push(tc);
    if (!turnStart) turnStart = tc.started_at;
    turnEnd = tc.completed_at ?? tc.started_at;
    tcIndex++;
  }
  if (currentToolCalls.length > 0) flush();

  return turns;
}

function findNextUserMessageTime(messages: MessageRow[], startIdx: number): string | undefined {
  for (let i = startIdx; i < messages.length; i++) {
    if (messages[i].role === 'user' && messages[i].type === 'text') return messages[i].created_at;
  }
  return undefined;
}

export function groupEventsByTurn(events: HookEvent[]): TurnGroup[] {
  const turns: TurnGroup[] = [];
  let currentEvents: HookEvent[] = [];
  let currentPrompt: string | null = null;
  let turnStart: string | null = null;

  const flushTurn = (endTime: string) => {
    if (currentEvents.length === 0) return;
    turns.push({
      id: turns.length,
      userPrompt: currentPrompt,
      events: currentEvents,
      toolCalls: matchToolCalls(currentEvents),
      startTime: turnStart ?? currentEvents[0].timestamp,
      endTime,
    });
    currentEvents = [];
    currentPrompt = null;
    turnStart = null;
  };

  for (const event of events) {
    const name = event.event.hook_event_name;

    if (name === 'agentSpawn') {
      flushTurn(event.timestamp);
      turns.push({
        id: turns.length,
        userPrompt: null,
        events: [event],
        toolCalls: [],
        startTime: event.timestamp,
        endTime: event.timestamp,
      });
      continue;
    }

    if (name === 'userPromptSubmit') {
      flushTurn(event.timestamp);
      currentPrompt = event.event.prompt ?? null;
      turnStart = event.timestamp;
      currentEvents.push(event);
      continue;
    }

    if (name === 'stop') {
      currentEvents.push(event);
      flushTurn(event.timestamp);
      continue;
    }

    currentEvents.push(event);
  }

  if (currentEvents.length > 0) {
    flushTurn(currentEvents[currentEvents.length - 1].timestamp);
  }

  return turns;
}

function matchToolCalls(events: HookEvent[]): ToolCallPair[] {
  const pairs: ToolCallPair[] = [];
  const pending = new Map<string, HookEvent[]>();

  for (const event of events) {
    const name = event.event.hook_event_name;
    const toolName = event.event.tool_name;
    if (!toolName) continue;

    if (name === 'preToolUse') {
      const queue = pending.get(toolName) ?? [];
      queue.push(event);
      pending.set(toolName, queue);
    } else if (name === 'postToolUse') {
      const queue = pending.get(toolName);
      const pre = queue?.shift();
      if (pre) {
        pairs.push({
          toolName,
          input: pre.event.tool_input ?? {},
          response: event.event.tool_response,
          startTime: pre.timestamp,
          endTime: event.timestamp,
        });
      } else {
        pairs.push({
          toolName,
          input: event.event.tool_input ?? {},
          response: event.event.tool_response,
          startTime: event.timestamp,
          endTime: event.timestamp,
        });
      }
    }
  }

  for (const [toolName, queue] of pending) {
    for (const pre of queue) {
      pairs.push({
        toolName,
        input: pre.event.tool_input ?? {},
        startTime: pre.timestamp,
      });
    }
  }

  return pairs;
}
