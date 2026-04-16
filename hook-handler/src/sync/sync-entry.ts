import { syncAgentTimeouts } from "@weaver/binding-kiro/sync";

const cwdIndex = process.argv.indexOf("--cwd");
const cwd = cwdIndex !== -1 ? process.argv[cwdIndex + 1] : process.cwd();
syncAgentTimeouts(cwd);
