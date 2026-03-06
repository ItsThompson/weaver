#!/usr/bin/env node
import { view } from './commands/view.js';
import { session } from './commands/session.js';
import { rename } from './commands/rename.js';
import { toggle } from './commands/toggle.js';
import { config } from './commands/config.js';

// argv: [node, script, callerPid, command, ...args]
const callerPid = parseInt(process.argv[2], 10);
const command = process.argv[3];
const args = process.argv.slice(4);

const COMMANDS: Record<string, (pid: number, args: string[]) => void> = {
  view,
  session,
  rename,
  toggle,
  config,
};

if (!command || command === '--help' || command === '-h') {
  console.log(`Usage: weaver <command>

Commands:
  view              Navigate dashboard to the current kiro-cli session
  session           Navigate dashboard to the sessions list (default: list)
  session list      Navigate dashboard to the sessions list
  session <PID>     Navigate dashboard to a specific session by PID
  rename <name>     Rename the current kiro-cli session
  toggle            Toggle between main and mini mode
  config ghost      Toggle ghost mode (or: on | off)
  config ghost opacity <0-1>  Set ghost opacity
  config dark       Toggle dark mode (or: on | off)
  config sounds     Toggle notification sounds (or: on | off)`);
  process.exit(0);
}

const handler = COMMANDS[command];
if (!handler) {
  console.error(`Unknown command: ${command}\nRun 'weaver --help' for usage.`);
  process.exit(1);
}

handler(callerPid, args);
