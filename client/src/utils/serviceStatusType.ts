import type { ServiceState } from "@weaver/shared/types";

export function serviceStatusType(
  state: ServiceState,
): "success" | "error" | "in-progress" | "info" {
  if (state === "running") {
    return "success";
  }
  if (state === "starting") {
    return "in-progress";
  }
  if (state === "not_configured") {
    return "info";
  }
  return "error";
}
