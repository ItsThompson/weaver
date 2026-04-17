import { WeaverEventName } from "@weaver/shared/types";
import type { WeaverEvent } from "@weaver/shared/types";

export interface LastEvent {
  name: WeaverEventName;
  timestamp: string;
}

export function isValidationEvent(
  event: WeaverEvent,
): event is WeaverEvent & {
  validationResults: NonNullable<WeaverEvent["validationResults"]>;
} {
  return (
    event.eventName === WeaverEventName.VALIDATION &&
    Array.isArray(event.validationResults)
  );
}
