import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@weaver/shared/session";
import type { HookEvent } from "@weaver/shared/events";
import type { WeaverConfig } from "@weaver/shared/config";
import { DEFAULT_CONFIG } from "@weaver/shared/config";
import { WeaverDb } from "@weaver/shared/db";

const weaverDir = (tmpDir: string) => join(tmpDir, ".weaver");

export function makeSession(overrides?: Partial<Session>): Session {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    pid: Math.floor(Math.random() * 90000) + 10000,
    customName: null,
    cwd: "/tmp/test-project",
    agentName: null,
    startTime: now,
    lastEventTime: now,
    ...overrides,
  };
}

export function makeHookEvent(overrides?: Partial<HookEvent>): HookEvent {
  return {
    timestamp: new Date().toISOString(),
    event: {
      hook_event_name: "userPromptSubmit",
      cwd: "/tmp/test-project",
      prompt: "test prompt",
    },
    ...overrides,
  };
}

function getDb(tmpDir: string): WeaverDb {
  return new WeaverDb({ dbPath: join(weaverDir(tmpDir), "weaver.sqlite3") });
}

export async function seedSession(
  tmpDir: string,
  session: Partial<Session>,
): Promise<Session> {
  const full = makeSession(session);
  const db = getDb(tmpDir);
  try {
    db.createSession({
      id: full.id,
      agent_session_id: null,
      pid: full.pid,
      cwd: full.cwd,
      agent_name: full.agentName,
      custom_name: full.customName,
      model: null,
      status: "open",
      context_usage_percent: null,
      created_at: full.startTime,
    });
  } finally {
    db.close();
  }
  return full;
}

export async function seedLogEvents(
  tmpDir: string,
  sessionId: string,
  events: HookEvent[],
): Promise<void> {
  const db = getDb(tmpDir);
  try {
    for (const event of events) {
      const name = event.event.hook_event_name;
      if (name === "userPromptSubmit") {
        db.appendMessage({
          session_id: sessionId,
          role: "user",
          type: "text",
          content: event.event.prompt ?? null,
          metadata: null,
          created_at: event.timestamp,
        });
      } else if (name === "preToolUse" || name === "postToolUse") {
        const toolName = event.event.tool_name ?? "unknown";
        const tcId = `${sessionId}-${toolName}-${event.timestamp}`;
        db.upsertToolCall({
          id: tcId,
          session_id: sessionId,
          message_id: null,
          tool_name: toolName,
          kind: null,
          status: name === "postToolUse" ? "completed" : "pending",
          input: event.event.tool_input ? JSON.stringify(event.event.tool_input) : null,
          output: event.event.tool_response ? JSON.stringify(event.event.tool_response) : null,
          permission_response: null,
          started_at: event.timestamp,
          completed_at: name === "postToolUse" ? event.timestamp : null,
        });
      }
      db.appendEvent({
        session_id: sessionId,
        event_type: name,
        data: JSON.stringify(event.event),
        created_at: event.timestamp,
      });
    }
  } finally {
    db.close();
  }
}

export async function seedConfig(
  tmpDir: string,
  config: Partial<WeaverConfig>,
): Promise<void> {
  const merged = { ...DEFAULT_CONFIG, ...config };
  await writeFile(
    join(weaverDir(tmpDir), "config.json"),
    JSON.stringify(merged, null, 2),
  );
}
