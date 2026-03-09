import { resolve, relative } from 'node:path';
import { getCurrentTurnEvents } from './turn-boundary.js';

export function buildTestRunnerRegex(runners: string[]): RegExp {
  const escaped = runners.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`);
}

export function extractAgentTestedDirs(sessionLogPath: string, cwd: string, testRunners: string[]): string[] {
  if (!testRunners.length) return [];
  const re = buildTestRunnerRegex(testRunners);
  const events = getCurrentTurnEvents(sessionLogPath);
  const dirs: string[] = [];

  for (const e of events) {
    if (e.event.hook_event_name !== 'postToolUse' || e.event.tool_name !== 'execute_bash') continue;

    const command = e.event.tool_input?.command;
    if (typeof command !== 'string') continue;

    const match = re.exec(command);
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
