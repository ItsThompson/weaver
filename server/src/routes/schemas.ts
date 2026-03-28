import { z } from "zod";

const hookEventName = z.enum([
  "agentSpawn",
  "stop",
  "preToolUse",
  "postToolUse",
  "userPromptSubmit",
  "validation",
]);

export const notifyBody = z.object({
  sessionId: z.string(),
  eventName: hookEventName.optional(),
});

export const viewBody = z.object({ pid: z.number() });

export const navigateBody = z.object({ page: z.string() });

export const renameBody = z.object({ pid: z.number(), customName: z.string() });

export const patchSessionBody = z.object({ customName: z.string() });

export const webhookToggleBody = z.object({ enabled: z.boolean() });

export const assignOrphansBody = z.object({
  targetSessionId: z.string(),
  pid: z.number(),
});
