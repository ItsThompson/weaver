import { post } from "../utils";
import { print } from "../utils/output";

export function view(pid: number, _args: string[]): void {
  const { ok, status } = post("/api/view", { pid });

  if (status === 0) {
    print("Weaver server not running");
  } else if (ok) {
    print("Opening session in Weaver dashboard");
  } else if (status === 404) {
    print(`No Weaver session found for PID ${pid}`);
  } else {
    print(`Weaver server error (${status})`);
  }
}
