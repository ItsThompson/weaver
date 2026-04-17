#!/usr/bin/env node
import { view } from "./commands/view";
import { session } from "./commands/session";
import { rename } from "./commands/rename";
import { toggle } from "./commands/toggle";
import { config } from "./commands/config";
import { sync } from "./commands/sync";
import { print, printError } from "./utils/output";

// argv: [node, script, callerPid, harness, command, ...args]
const callerPid = parseInt(process.argv[2], 10);
const harness = process.argv[3] ?? "kiro-cli";
const command = process.argv[4];
const args = process.argv.slice(5);

const COMMANDS: Record<string, (pid: number, args: string[]) => void> = {
  view,
  session,
  rename,
  toggle,
  config,
  sync: (pid, cmdArgs) => sync(pid, cmdArgs, harness),
};

if (!command || command === "--help" || command === "-h") {
  print(`Usage: weaver <command>

Commands:
  view              Navigate dashboard to the current session
  session           Navigate dashboard to the sessions list (default: list)
  session list      Navigate dashboard to the sessions list
  session <PID>     Navigate dashboard to a specific session by PID
  rename <name>     Rename the current session
  toggle            Toggle between main and mini mode
  config ghost      Toggle ghost mode (or: on | off)
  config ghost opacity <0-1>  Set ghost opacity
  config dark       Toggle dark mode (or: on | off)
  config sounds     Toggle notification sounds (or: on | off)
  sync [--dry-run]  Sync .weaver validation timeouts to .kiro/agents/ configs`);
  process.exit(0);
}

const handler = COMMANDS[command];
if (!handler) {
  printError(`Unknown command: ${command}\nRun 'weaver --help' for usage.`);
  process.exit(1);
}

handler(callerPid, args);
