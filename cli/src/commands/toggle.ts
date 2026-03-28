import { post } from "../utils";
import { print } from "../utils/output";

export function toggle(pid: number, _args: string[]): void {
  const { ok, status } = post("/api/navigate", { page: "toggle", pid });

  if (status === 0) {
    print("Weaver server not running");
  } else if (ok) {
    print("Toggled Weaver mode");
  } else {
    print(`Weaver server error (${status})`);
  }
}
