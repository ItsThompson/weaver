import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ValidationResult } from '@weaver/shared/types';
import { formatDuration } from '@weaver/shared/utils';

interface PendingFile {
  results: ValidationResult[];
}

function parseArgs(argv: string[]): string {
  const index = argv.indexOf('--session-id', 2);
  if (index !== -1 && argv[index + 1]) return argv[index + 1];
  return '';
}

function formatResult(r: ValidationResult): string {
  if (r.skipped_reason) {
    return `⊘ ${r.name} — skipped (${r.skipped_reason})`;
  }
  const dur = formatDuration(r.duration_ms);
  if (r.passed) {
    return `✓ ${r.name} (${dur})`;
  }
  const header = `✗ ${r.name} (${dur}${r.timed_out ? ', timed out' : ''})`;
  if (!r.output) return header;
  
  const lines = r.output.trimEnd().split('\n');
  const indented = lines.map(line => `  ${line}`).join('\n');
  return `${header}\n${indented}`;
}

export function runInject(sessionId: string): { stdout: string; exitCode: number } {
  if (!sessionId) return { stdout: '', exitCode: 0 };

  const pendingPath = join(homedir(), '.weaver', 'logs', `${sessionId}.pending`);
  if (!existsSync(pendingPath)) return { stdout: '', exitCode: 0 };

  let data: PendingFile;
  try {
    data = JSON.parse(readFileSync(pendingPath, 'utf-8'));
    if (!Array.isArray(data?.results)) throw new Error('invalid');
  } catch {
    try { unlinkSync(pendingPath); } catch { /* best effort */ }
    return { stdout: '', exitCode: 0 };
  }

  try { unlinkSync(pendingPath); } catch { /* best effort */ }

  const lines = data.results.map(formatResult);
  const stdout = `[Weaver Validation — Previous Turn]\n\n${lines.join('\n\n')}\n`;
  return { stdout, exitCode: 0 };
}

// CLI entry point
const sessionId = parseArgs(process.argv);
const result = runInject(sessionId);
if (result.stdout) process.stdout.write(result.stdout);
process.exit(result.exitCode);
