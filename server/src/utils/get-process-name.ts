import type { Session } from "@weaver/shared/types";
import { Harness } from "@weaver/shared/types";
import { getAdapter } from "@weaver/shared/adapter-registry";

/** Resolve the process name for alive-detection from a session's harness. Returns null if the adapter is unknown. */
export function getProcessName(session: Session): string | null {
  try {
    return getAdapter(session.harness ?? Harness.KIRO_CLI).processName;
  } catch {
    return null;
  }
}
