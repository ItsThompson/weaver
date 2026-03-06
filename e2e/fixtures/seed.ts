import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@weaver/shared/session";
import type { HookEvent, HookEventData } from "@weaver/shared/events";
import type { WeaverConfig } from "@weaver/shared/config";
import { DEFAULT_CONFIG } from "@weaver/shared/config";

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

export async function seedSession(
  tmpDir: string,
  session: Partial<Session>,
): Promise<Session> {
  const full = makeSession(session);
  const file = join(weaverDir(tmpDir), "sessions.jsonl");
  await appendFile(file, JSON.stringify(full) + "\n");
  return full;
}

export async function seedLogEvents(
  tmpDir: string,
  sessionId: string,
  events: HookEvent[],
): Promise<void> {
  const dir = join(weaverDir(tmpDir), "logs");
  await mkdir(dir, { recursive: true });
  const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(join(dir, `${sessionId}.jsonl`), lines);
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
