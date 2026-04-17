#!/usr/bin/env npx tsx
/**
 * One-time migration: converts legacy HookEvent JSONL to canonical WeaverEvent format
 * and adds `harness: "kiro-cli"` to session entries.
 *
 * Usage: npx tsx scripts/migrate-v2.ts
 *
 * Safe to re-run: already-converted entries are left unchanged.
 */
import {
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  existsSync,
  unlinkSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const WEAVER_DIR = join(homedir(), ".weaver");
const SESSIONS_PATH = join(WEAVER_DIR, "sessions.jsonl");
const LOGS_DIR = join(WEAVER_DIR, "logs");
const ORPHAN_PATH = join(LOGS_DIR, "orphan.jsonl");

interface Summary {
  sessionsPatched: number;
  sessionsSkipped: number;
  filesConverted: number;
  eventsConverted: number;
  eventsSkipped: number;
  errors: string[];
}

const summary: Summary = {
  sessionsPatched: 0,
  sessionsSkipped: 0,
  filesConverted: 0,
  eventsConverted: 0,
  eventsSkipped: 0,
  errors: [],
};

// --- Backup ---

function backupFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  const backupPath = `${filePath}.pre-v2`;
  if (existsSync(backupPath)) {
    return;
  } // don't overwrite a previous backup
  copyFileSync(filePath, backupPath);
  console.log("  Backed up %s", backupPath);
}

// --- Atomic write ---

function atomicWrite(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, "utf-8");
  try {
    renameSync(tmp, filePath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw err;
  }
}

// --- Session migration ---

function migrateSessionsFile(): void {
  if (!existsSync(SESSIONS_PATH)) {
    console.log("No sessions.jsonl found, skipping.");
    return;
  }

  const lines = readFileSync(SESSIONS_PATH, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  const output: string[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.harness) {
        output.push(line);
        summary.sessionsSkipped++;
      } else {
        entry.harness = "kiro-cli";
        output.push(JSON.stringify(entry));
        summary.sessionsPatched++;
      }
    } catch {
      output.push(line); // preserve malformed lines
    }
  }

  if (output.length !== lines.length) {
    summary.errors.push(
      `sessions.jsonl: output ${output.length} != input ${lines.length}`,
    );
    return;
  }

  backupFile(SESSIONS_PATH);
  atomicWrite(SESSIONS_PATH, output.join("\n") + "\n");
}

// --- Event migration ---

/** Maps legacy harness-native event names to canonical kebab-case values. */
const CANONICAL_EVENT_NAME: Record<string, string> = {
  // kiro-cli camelCase
  agentSpawn: "agent-spawn",
  stop: "stop",
  preToolUse: "pre-tool-use",
  postToolUse: "post-tool-use",
  userPromptSubmit: "user-prompt-submit",
  validation: "validation",
  // Claude Code PascalCase
  SessionStart: "session-start",
  SessionEnd: "session-end",
  SubagentStart: "subagent-start",
  SubagentStop: "subagent-stop",
  Notification: "notification",
  PostToolUseFailure: "post-tool-use-failure",
  PermissionRequest: "permission-request",
  PermissionDenied: "permission-denied",
  TaskCreated: "task-created",
  TaskCompleted: "task-completed",
  StopFailure: "stop-failure",
  TeammateIdle: "teammate-idle",
  ConfigChange: "config-change",
  PreCompact: "pre-compact",
  PostCompact: "post-compact",
};

const CANONICAL_VALUES = new Set(Object.values(CANONICAL_EVENT_NAME));

function canonicalizeEventName(name: string): string {
  return CANONICAL_EVENT_NAME[name] ?? name;
}

function convertEvent(raw: Record<string, unknown>, sessionId: string): string {
  // Already canonical format: check if eventName needs re-canonicalization
  if ("eventName" in raw) {
    const currentName = String(raw.eventName);
    if (CANONICAL_VALUES.has(currentName)) {
      summary.eventsSkipped++;
      return JSON.stringify(raw);
    }
    // Previously migrated with old non-canonical values: re-canonicalize
    raw.eventName = canonicalizeEventName(currentName);
    summary.eventsConverted++;
    return JSON.stringify(raw);
  }

  // Legacy HookEvent: { timestamp, pid?, event: { hook_event_name, cwd, ... } }
  const event = raw.event as Record<string, unknown> | undefined;
  if (!event || typeof event.hook_event_name !== "string") {
    summary.eventsSkipped++;
    return JSON.stringify(raw);
  }

  const canonical: Record<string, unknown> = {
    sessionId,
    timestamp: raw.timestamp,
    harness: "kiro-cli",
    eventName: canonicalizeEventName(String(event.hook_event_name)),
    cwd: event.cwd,
  };

  if (raw.pid != null) {
    canonical.pid = raw.pid;
  }
  if (event.prompt != null) {
    canonical.prompt = event.prompt;
  }
  if (event.tool_name != null) {
    canonical.toolName = event.tool_name;
  }
  if (event.tool_input != null) {
    canonical.toolInput = event.tool_input;
  }
  if (event.tool_response != null) {
    canonical.toolResponse = event.tool_response;
  }

  // Validation event fields
  if (event.hook_event_name === "validation") {
    if (event.results != null) {
      canonical.validationResults = event.results;
    }
    if (event.trigger != null) {
      canonical.validationTrigger = event.trigger;
    }
    if (event.changed_files != null) {
      canonical.validationChangedFiles = event.changed_files;
    }
    if (event.agent_tested_dirs != null) {
      canonical.validationAgentTestedDirs = event.agent_tested_dirs;
    }
  }

  summary.eventsConverted++;
  return JSON.stringify(canonical);
}

function migrateLogFile(filePath: string, sessionId: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length === 0) {
    return;
  }

  const output: string[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      output.push(convertEvent(parsed, sessionId));
    } catch {
      output.push(line); // preserve malformed lines
    }
  }

  if (output.length !== lines.length) {
    summary.errors.push(
      `${filePath}: output ${output.length} != input ${lines.length}`,
    );
    return;
  }

  backupFile(filePath);
  atomicWrite(filePath, output.join("\n") + "\n");
  summary.filesConverted++;
}

function migrateAllLogs(): void {
  if (!existsSync(LOGS_DIR)) {
    console.log("No logs directory found, skipping.");
    return;
  }

  const files = readdirSync(LOGS_DIR).filter(
    (f) => f.endsWith(".jsonl") && f !== "orphan.jsonl",
  );
  for (const file of files) {
    const sessionId = file.replace(".jsonl", "");
    migrateLogFile(join(LOGS_DIR, file), sessionId);
  }

  // Orphan file
  migrateLogFile(ORPHAN_PATH, "orphan");
}

// --- Main ---

console.log(
  "Weaver v2 migration: converting legacy events to canonical format\n",
);

migrateSessionsFile();
migrateAllLogs();

console.log(
  "Sessions: %d patched, %d already migrated",
  summary.sessionsPatched,
  summary.sessionsSkipped,
);
console.log(
  "Events:   %d converted, %d already migrated",
  summary.eventsConverted,
  summary.eventsSkipped,
);
console.log("Files:    %d log files written", summary.filesConverted);

if (summary.errors.length > 0) {
  console.error("\nErrors (files left unchanged):");
  summary.errors.forEach((e) => console.error("  " + e));
  process.exit(1);
} else {
  console.log("\nMigration complete.");
}
