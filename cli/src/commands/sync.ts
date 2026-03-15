import { syncAgentTimeouts } from "@weaver/shared/sync";

export function sync(_pid: number, args: string[]): void {
  const dryRun = args.includes("--dry-run");
  const result = syncAgentTimeouts(process.cwd(), { dryRun });

  const prefix = dryRun ? "would patch" : "patched";
  result.patched.forEach((file) => console.log(`${prefix}: ${file}`));
  result.errors.forEach((error) => console.log(`error: ${error}`));

  if (!result.patched.length && !result.errors.length) {
    console.log("All agent configs already in sync");
  }
}
