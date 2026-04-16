import { Harness } from "@weaver/shared/types";
import { syncAgentTimeouts } from "@weaver/binding-kiro/sync";
import { print, printError } from "../utils/output";

export function sync(
  _pid: number,
  args: string[],
  harness = Harness.KIRO_CLI as string,
): void {
  if (harness !== Harness.KIRO_CLI) {
    printError(`sync is not yet supported for ${harness}`);
    process.exit(1);
    return;
  }

  const dryRun = args.includes("--dry-run");
  const result = syncAgentTimeouts(process.cwd(), { dryRun });

  const prefix = dryRun ? "would patch" : "patched";
  result.patched.forEach((file) => print(`${prefix}: ${file}`));
  result.errors.forEach((error) => print(`error: ${error}`));

  if (!result.patched.length && !result.errors.length) {
    print("All agent configs already in sync");
  }
}
