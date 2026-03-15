import type { HookEventData, ValidationResult } from "@weaver/shared/types";

export interface LastEvent {
  name: string;
  timestamp: string;
}

/** HookEventData with validation-specific fields present at runtime. */
export interface ValidationHookEventData extends HookEventData {
  results: ValidationResult[];
}

export function isValidationEvent(
  data: HookEventData,
): data is ValidationHookEventData {
  return (
    data.hook_event_name === "validation" &&
    "results" in data &&
    Array.isArray(data.results)
  );
}
