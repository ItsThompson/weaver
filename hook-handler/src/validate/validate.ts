import { parseArgs, runValidation } from "./run-validation";

// CLI entry point
const args = parseArgs(process.argv);
const result = runValidation(args);
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(result.exitCode);
