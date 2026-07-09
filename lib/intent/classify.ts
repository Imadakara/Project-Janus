import { embedText } from "@/lib/embeddings/client";
import { findBestIntentMatch } from "./similarity";
import { extractTags } from "./tags";
import { resolveMentionedEntities } from "./entities";
import { IntentResultSchema, type IntentResult, type ShortTermMemoryEntry } from "./schema";

export type ClassifyIntentSessionContext = {
  shortTermMemory: ShortTermMemoryEntry[];
};

// Классификация confidence/medium/low-порогов здесь намеренно не определяется — это
// калибровочный параметр Слоя 1 (см. lib/scenario/thresholds.ts).
export async function classifyIntent(
  message: string,
  sessionContext: ClassifyIntentSessionContext,
): Promise<IntentResult> {
  const vector = await embedText(message);
  const match = await findBestIntentMatch(vector);

  const confidence = match ? Math.min(1, Math.max(0, 1 - match.distance)) : 0;

  return IntentResultSchema.parse({
    intent: match ? match.code : null,
    confidence,
    tags: extractTags(message),
    mentionedEntities: resolveMentionedEntities(message, sessionContext.shortTermMemory),
  });
}
