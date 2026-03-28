import { syncAgentTimeouts } from "@weaver/shared/sync";
import { print } from "../utils/output";

export function sync(_pid: number, args: string[]): void {
  const dryRun = args.includes("--dry-run");
  const result = syncAgentTimeouts(process.cwd(), { dryRun });

  const prefix = dryRun ? "would patch" : "patched";
  result.patched.forEach((file) => print(`${prefix}: ${file}`));
  result.errors.forEach((error) => print(`error: ${error}`));

  if (!result.patched.length && !result.errors.length) {
    print("All agent configs already in sync");
  }
}
