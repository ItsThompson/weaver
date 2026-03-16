import {
  VALID_OPEN_DISPLAY_OPTIONS,
  VALID_CLOSE_DISPLAY_OPTIONS,
} from "@weaver/shared/types";
import type { FieldValidator } from "./types";
import { validateBoolean, validateDisplayOptions } from "./factory";
import {
  validatePageSize,
  validateGhostOpacity,
  validateWebhookUrl,
  validateWebhookFormat,
  validateTestRunners,
  validateSkillGraph,
} from "./field";

export const FIELD_VALIDATORS: Record<string, FieldValidator> = {
  enable_notification_sounds: validateBoolean("enable_notification_sounds"),
  dark_mode: validateBoolean("dark_mode"),
  ghost_mode: validateBoolean("ghost_mode"),
  ghost_opacity: validateGhostOpacity,
  page_size: validatePageSize,
  open_display_options: validateDisplayOptions(
    "open_display_options",
    VALID_OPEN_DISPLAY_OPTIONS,
  ),
  close_display_options: validateDisplayOptions(
    "close_display_options",
    VALID_CLOSE_DISPLAY_OPTIONS,
  ),
  webhook_url: validateWebhookUrl,
  webhook_format: validateWebhookFormat,
  test_runners: validateTestRunners,
  skill_graph: validateSkillGraph,
};
