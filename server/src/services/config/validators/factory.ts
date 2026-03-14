import type { FieldValidator } from "./types";

export function validateBoolean(field: string): FieldValidator {
  return (value) => {
    if (typeof value !== "boolean") {
      return { warning: `${field} must be a boolean` };
    }
    return { value };
  };
}

export function validateDisplayOptions(
  field: string,
  valid: readonly string[],
): FieldValidator {
  return (value) => {
    if (!Array.isArray(value)) {
      return { warning: `${field} must be an array of strings` };
    }
    if (!value.every((v) => typeof v === "string")) {
      return { warning: `${field} must contain only strings` };
    }

    const invalid = value.filter((v: string) => !valid.includes(v));
    if (invalid.length > 0) {
      return {
        warning: `${field} contains invalid options: ${invalid.join(", ")}`,
      };
    }
    return { value: value as string[] };
  };
}
