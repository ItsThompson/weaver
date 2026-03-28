import { post } from "../utils";
import { print, printError } from "../utils/output";

export function rename(pid: number, args: string[]): void {
  const name = args.join(" ").trim();
  if (!name) {
    printError("Usage: weaver rename <name>");
    process.exit(1);
  }

  const { ok, status } = post("/api/rename", { pid, customName: name });

  if (status === 0) {
    print("Weaver server not running");
  } else if (ok) {
    print(`Session renamed to "${name}"`);
  } else if (status === 404) {
    print(`No Weaver session found for PID ${pid}`);
  } else {
    print(`Weaver server error (${status})`);
  }
}
