import { z } from "zod";

/** Validates each item against a Zod schema, returning only valid entries. Logs invalid items to stderr. */
export function filterValid<T>(
  items: unknown[],
  schema: z.ZodType<T>,
  label: string,
): T[] {
  return items.reduce<T[]>((acc, item) => {
    const result = schema.safeParse(item);
    if (result.success) {
      acc.push(result.data);
    } else {
      console.error(`weaver: invalid ${label}, skipping`);
    }
    return acc;
  }, []);
}

/** Reads a validation array from a config object, validates each entry against a schema. Returns undefined if the key is absent. */
export function parseValidationArray<T>(
  v: Record<string, unknown>,
  key: string,
  schema: z.ZodType<T>,
  label: string,
): T[] | undefined {
  if (v[key] === undefined) {
    return undefined;
  }
  if (!Array.isArray(v[key])) {
    console.error(`weaver: .weaver.json validation.${key} must be an array`);
    return undefined;
  }
  return filterValid(v[key], schema, label);
}
