import { post } from "../utils";
import { print, printError } from "../utils/output";

export function session(pid: number, args: string[]): void {
  const subcommand = args[0];

  // weaver session <PID> — navigate to specific session by PID
  if (subcommand && /^\d+$/.test(subcommand)) {
    const targetPid = parseInt(subcommand, 10);
    const { ok, status } = post("/api/view", { pid: targetPid });

    if (status === 0) {
      print("Weaver server not running");
    } else if (ok) {
      print(`Opening session for PID ${targetPid} in Weaver dashboard`);
    } else if (status === 404) {
      print(`No session found for PID ${targetPid}`);
    } else {
      print(`Weaver server error (${status})`);
    }
    return;
  }

  // weaver session list (or no subcommand) — navigate to sessions list
  if (!subcommand || subcommand === "list") {
    const { ok, status } = post("/api/navigate", { page: "sessions" });

    if (status === 0) {
      print("Weaver server not running");
    } else if (ok) {
      print("Opening sessions list in Weaver dashboard");
    } else {
      print(`Weaver server error (${status})`);
    }
    return;
  }

  printError(`Unknown session subcommand: ${subcommand}`);
  printError("Usage: weaver session [list | <PID>]");
  process.exit(1);
}
