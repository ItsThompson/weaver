import { z } from "zod";

export function filterValid<T>(
  items: unknown[],
  schema: z.ZodType<T>,
  label: string,
): T[] {
  return items.reduce<T[]>((acc, item) => {
    const result = schema.safeParse(item);
    if (result.success) acc.push(result.data);
    else console.error(`weaver: invalid ${label}, skipping`);
    return acc;
  }, []);
}
