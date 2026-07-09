import { z } from "zod";

export const IntentResultSchema = z.object({
  intent: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()),
  mentionedEntities: z.array(z.string()),
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

export type ShortTermMemoryEntry = {
  entity: string;
  mentionedAt: string; // ISO timestamp
};
