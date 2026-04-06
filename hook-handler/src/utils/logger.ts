import { createLogger } from "@weaver/shared/logger";

export type { LogEntry } from "@weaver/shared/logger";

// Writes to stderr because stdout is reserved for hook output consumed by kiro-cli
export const log = createLogger("hook-handler", { stderr: true });
