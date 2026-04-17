import { resolve, dirname } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { syncClaudeCodeHooks } from "./sync";

const cwdIndex = process.argv.indexOf("--cwd");
const cwd = cwdIndex !== -1 ? process.argv[cwdIndex + 1] : process.cwd();

// Resolve the hook command path relative to this script's binding directory
const scriptDir = dirname(realpathSync(fileURLToPath(import.meta.url)));
const bindingDir = resolve(scriptDir, "..");
const hookCommand = resolve(bindingDir, "weaver-log.sh");

syncClaudeCodeHooks(cwd, hookCommand);
