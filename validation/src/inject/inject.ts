import { runInject } from "./run-inject";

function parseArgs(argv: string[]): string {
  const index = argv.indexOf("--session-id", 2);
  if (index !== -1 && argv[index + 1]) {
    return argv[index + 1];
  }
  return "";
}

// CLI entry point
const sessionId = parseArgs(process.argv);
const result = runInject(sessionId);
if (result.stdout) {
  process.stdout.write(result.stdout);
}
process.exit(result.exitCode);
