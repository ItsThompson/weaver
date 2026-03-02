#!/usr/bin/env node
import { view } from './commands/view.js';
import { sessions } from './commands/sessions.js';

// argv: [node, script, callerPid, command, ...args]
const callerPid = parseInt(process.argv[2], 10);
const command = process.argv[3];
const args = process.argv.slice(4);

const COMMANDS: Record<string, (pid: number, args: string[]) => void> = {
  view,
  sessions,
};

if (!command || command === '--help' || command === '-h') {
  console.log(`Usage: weaver <command>

Commands:
  view       Navigate dashboard to the current kiro-cli session
  sessions   Navigate dashboard to the sessions list`);
  process.exit(0);
}

const handler = COMMANDS[command];
if (!handler) {
  console.error(`Unknown command: ${command}\nRun 'weaver --help' for usage.`);
  process.exit(1);
}

handler(callerPid, args);
