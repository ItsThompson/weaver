import { post } from "../utils.js";

export function view(pid: number, _args: string[]): void {
  const { ok, status } = post("/api/view", { pid });

  if (status === 0) {
    console.log("Weaver server not running");
  } else if (ok) {
    console.log("Opening session in Weaver dashboard");
  } else if (status === 404) {
    console.log(`No Weaver session found for PID ${pid}`);
  } else {
    console.log(`Weaver server error (${status})`);
  }
}
