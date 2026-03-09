import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { homedir } from 'node:os';
import type { ValidationResult, ValidationEvent, StopValidationHook } from '@weaver/shared/types';
import { readProjectConfig, resolveTestRunners } from './config.js';
import { extractChangedFiles } from './changed-files.js';
import { extractAgentTestedDirs } from './agent-tests.js';
import { resolveTestDirs } from './scope.js';

// Inlined from @weaver/shared/types — runtime ESM re-exports don't resolve (see progress notes)
const DEFAULT_STOP_TIMEOUT_MS = 30_000;
const DEFAULT_POST_TOOL_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_LENGTH = 5_000;

export interface ValidateArgs {
  sessionId: string;
  cwd: string;
  trigger: 'stop' | 'postToolUse';
  toolName?: string;
  toolInput?: string;
}

export interface ValidateResult {
  exitCode: number;
  stderr?: string;
}

export function parseArgs(argv: string[]): ValidateArgs {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const val = argv[i + 1];
    if (key && val) args[key] = val;
  }
  return {
    sessionId: args['session-id'],
    cwd: args['cwd'],
    trigger: args['trigger'] as 'stop' | 'postToolUse',
    toolName: args['tool-name'],
    toolInput: args['tool-input'],
  };
}

/**
 * v1 extension-based glob matching only.
 * Supports patterns like `**\/*.{ts,tsx}` or `**\/*.py`.
 * Does NOT support full glob (directory patterns, negation, etc.).
 */
export function matchesExtensionGlob(files: string[], pattern: string): string[] {
  const braceMatch = pattern.match(/\.\{([^}]+)\}$/);
  if (braceMatch) {
    const exts = new Set(braceMatch[1].split(',').map((e) => '.' + e.trim()));
    return files.filter((f) => exts.has(extname(f)));
  }
  const singleMatch = pattern.match(/\*(\.[a-zA-Z0-9]+)$/);
  if (singleMatch) {
    return files.filter((f) => extname(f) === singleMatch[1]);
  }
  return files; // unrecognized pattern → don't filter
}

function substituteVars(command: string, vars: Record<string, string>): string {
  let result = command;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val);
  }
  return result;
}

function commandUsesVar(command: string, varName: string): boolean {
  return command.includes(`{{${varName}}}`);
}

function runCommand(command: string, cwd: string, timeoutMs: number): { output: string; exitCode: number | null; timedOut: boolean; durationMs: number } {
  const start = Date.now();
  const result = spawnSync(command, { shell: true, cwd, timeout: timeoutMs, encoding: 'utf-8' });
  const durationMs = Date.now() - start;
  const output = ((result.stdout || '') + (result.stderr || '')).slice(0, MAX_OUTPUT_LENGTH);
  const timedOut = result.signal === 'SIGTERM' || result.error?.message?.includes('ETIMEDOUT') === true;
  return { output, exitCode: result.status, timedOut, durationMs };
}

export function runStopHook(hook: StopValidationHook, changedFiles: string[], agentTestedDirs: string[], cwd: string): ValidationResult {
  if (hook.run_if_files_match) {
    const matching = matchesExtensionGlob(changedFiles, hook.run_if_files_match);
    if (matching.length === 0) {
      return { name: hook.name, passed: true, output: '', duration_ms: 0, timed_out: false, skipped_reason: 'no files matched run_if_files_match' };
    }
  }

  const files = changedFiles.join(' ');
  const filesCsv = changedFiles.join(',');
  const testDirs = commandUsesVar(hook.command, 'test_dirs')
    ? resolveTestDirs(changedFiles, hook.scope, cwd, agentTestedDirs).join(' ')
    : '';

  if (commandUsesVar(hook.command, 'files') && !files) {
    return { name: hook.name, passed: true, output: '', duration_ms: 0, timed_out: false, skipped_reason: 'no changed files' };
  }
  if (commandUsesVar(hook.command, 'test_dirs') && !testDirs) {
    return { name: hook.name, passed: true, output: '', duration_ms: 0, timed_out: false, skipped_reason: 'no test dirs after deduplication' };
  }

  const command = substituteVars(hook.command, { files, files_csv: filesCsv, test_dirs: testDirs });
  const workingDir = hook.working_dir ? join(cwd, hook.working_dir) : cwd;
  const timeout = hook.timeout_ms ?? DEFAULT_STOP_TIMEOUT_MS;
  const { output, exitCode, timedOut, durationMs } = runCommand(command, workingDir, timeout);

  return { name: hook.name, passed: exitCode === 0, output, duration_ms: durationMs, timed_out: timedOut };
}

function writeValidationEvent(sessionLogPath: string, sessionId: string, trigger: 'stop' | 'postToolUse', results: ValidationResult[], changedFiles: string[], agentTestedDirs: string[]): void {
  const event: ValidationEvent = { hook_event_name: 'validation', trigger, results, changed_files: changedFiles, agent_tested_dirs: agentTestedDirs };
  try {
    mkdirSync(dirname(sessionLogPath), { recursive: true });
    appendFileSync(sessionLogPath, JSON.stringify(event) + '\n');
  } catch { /* best effort */ }

  // Fire-and-forget server notification
  fetch('http://localhost:8143/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, eventName: 'validation' }),
    signal: AbortSignal.timeout(1000),
  }).catch(() => {});
}

function handleExitLogic(sessionId: string, results: ValidationResult[]): ValidateResult {
  const failed = results.filter((r) => !r.passed && !r.skipped_reason);
  const total = results.filter((r) => !r.skipped_reason).length;

  if (failed.length > 0) {
    const pendingPath = join(homedir(), '.weaver', 'logs', `${sessionId}.pending`);
    try { writeFileSync(pendingPath, JSON.stringify({ results })); } catch { /* best effort */ }
    const names = failed.map((r) => r.name).join(', ');
    return { exitCode: 1, stderr: `⚠ weaver: ${failed.length}/${total} validations failed (${names})\n` };
  }
  return { exitCode: 0 };
}

export function runValidation(args: ValidateArgs): ValidateResult {
  if (!args.sessionId || !args.cwd || !args.trigger) {
    return { exitCode: 1, stderr: 'Usage: node validate.js --session-id <id> --cwd <path> --trigger <stop|postToolUse>\n' };
  }

  const sessionLogPath = join(homedir(), '.weaver', 'logs', `${args.sessionId}.jsonl`);

  if (args.trigger === 'stop') {
    const config = readProjectConfig(args.cwd);
    if (!config?.validation?.stop?.length) return { exitCode: 0 };

    const changedFiles = extractChangedFiles(sessionLogPath);
    const testRunners = resolveTestRunners(config);
    const agentTestedDirs = extractAgentTestedDirs(sessionLogPath, args.cwd, testRunners);
    const results: ValidationResult[] = [];

    for (const hook of config.validation.stop) {
      results.push(runStopHook(hook, changedFiles, agentTestedDirs, args.cwd));
    }

    writeValidationEvent(sessionLogPath, args.sessionId, 'stop', results, changedFiles, agentTestedDirs);
    return handleExitLogic(args.sessionId, results);
  }

  if (args.trigger === 'postToolUse') {
    const config = readProjectConfig(args.cwd);
    const hooks = config?.validation?.postToolUse?.filter((h) => h.matcher === args.toolName);
    if (!hooks?.length) return { exitCode: 0 };

    let filePath = '';
    if (args.toolInput) {
      try { filePath = JSON.parse(args.toolInput).path || ''; } catch { /* ignore */ }
    }

    const results: ValidationResult[] = [];
    for (const hook of hooks) {
      const command = substituteVars(hook.command, { file: filePath });
      const timeout = hook.timeout_ms ?? DEFAULT_POST_TOOL_TIMEOUT_MS;
      const { output, exitCode, timedOut, durationMs } = runCommand(command, args.cwd, timeout);
      results.push({ name: hook.name, passed: exitCode === 0, output, duration_ms: durationMs, timed_out: timedOut });
    }

    writeValidationEvent(sessionLogPath, args.sessionId, 'postToolUse', results, [], []);
    return handleExitLogic(args.sessionId, results);
  }

  return { exitCode: 0 };
}

// CLI entry point
const args = parseArgs(process.argv);
const result = runValidation(args);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.exitCode);
