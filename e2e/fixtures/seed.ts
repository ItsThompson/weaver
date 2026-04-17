import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@weaver/shared/session";
import type { WeaverEvent } from "@weaver/shared/types";
import { Harness, WeaverEventName } from "@weaver/shared/types";
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
    harness: Harness.KIRO_CLI,
    ...overrides,
  };
}

export function makeWeaverEvent(overrides?: Partial<WeaverEvent>): WeaverEvent {
  return {
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    harness: Harness.KIRO_CLI,
    eventName: WeaverEventName.USER_PROMPT_SUBMIT,
    cwd: "/tmp/test-project",
    prompt: "test prompt",
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
  events: WeaverEvent[],
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
