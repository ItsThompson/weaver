import { createLogger } from "@weaver/shared/logger";

export type { LogEntry } from "@weaver/shared/logger";

export const log = createLogger("binding-kiro", { stderr: true });
