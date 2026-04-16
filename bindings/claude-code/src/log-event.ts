import { logEvent } from "@weaver/shared/log-event";
import { claudeCodeAdapter } from "./adapter";
import { log } from "./utils/logger";

logEvent(claudeCodeAdapter, log);
