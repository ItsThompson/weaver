import { z } from "zod";
import type { ZodType } from "zod";

export function zodBody(schema: ZodType) {
  return { body: z.toJSONSchema(schema, { target: "draft-07" }) };
}
