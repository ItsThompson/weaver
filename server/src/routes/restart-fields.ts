import { SERVICE_RESTART_FIELDS } from "@weaver/shared/types";
import type { WeaverConfig } from "@weaver/shared/types";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current !== null && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

export function needsServiceRestart(
  oldConfig: WeaverConfig,
  newConfig: WeaverConfig,
): boolean {
  return SERVICE_RESTART_FIELDS.some(
    (field) =>
      getNestedValue(oldConfig as unknown as Record<string, unknown>, field) !==
      getNestedValue(newConfig as unknown as Record<string, unknown>, field),
  );
}
