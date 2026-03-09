import { resolve, relative } from 'node:path';
import { getCurrentTurnEvents } from './turn-boundary.js';

const TEST_RUNNER_RE = /\b(jest|vitest|mocha|pytest|cargo\s+test|npm\s+test|npx\s+test)\b/;

export function extractAgentTestedDirs(sessionLogPath: string, cwd: string): string[] {
  const events = getCurrentTurnEvents(sessionLogPath);
  const dirs: string[] = [];

  for (const e of events) {
    if (e.event.hook_event_name !== 'postToolUse' || e.event.tool_name !== 'execute_bash') continue;

    const command = e.event.tool_input?.command;
    if (typeof command !== 'string') continue;

    const match = TEST_RUNNER_RE.exec(command);
    if (!match) continue;

    const afterRunner = command.slice(match.index + match[0].length).trim();
    const dir = extractDirArg(afterRunner);
    const resolved = relative(cwd, resolve(cwd, dir));
    dirs.push(resolved || '.');
  }

  return dirs;
}

function extractDirArg(args: string): string {
  const tokens = args.split(/\s+/).filter((t) => t && !t.startsWith('-'));
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].includes('/')) return tokens[i].replace(/\/+$/, '');
  }
  return '.';
}
