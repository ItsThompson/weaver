import { post } from "../utils.js";

export function toggle(pid: number, _args: string[]): void {
  const { ok, status } = post("/api/navigate", { page: "toggle", pid });

  if (status === 0) {
    console.log("Weaver server not running");
  } else if (ok) {
    console.log("Toggled Weaver mode");
  } else {
    console.log(`Weaver server error (${status})`);
  }
}
