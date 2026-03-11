import { z } from "zod";

export const stopHookSchema = z.object({
  name: z.string(),
  command: z.string(),
  scope: z
    .union([z.enum(["file", "parent", "cwd"]), z.number()])
    .optional(),
  run_if_files_match: z.string().optional(),
  working_dir: z.string().optional(),
  timeout_ms: z.number().optional(),
});

export const postToolHookSchema = z.object({
  matcher: z.string(),
  name: z.string(),
  command: z.string(),
  timeout_ms: z.number().optional(),
});
