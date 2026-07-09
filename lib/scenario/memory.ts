import type { ShortTermMemoryEntry } from "./types";

const SHORT_TERM_MEMORY_LIMIT = 5;

export function nextShortTermMemory(
  prev: ShortTermMemoryEntry[],
  mentionedEntities: string[],
  now: string = new Date().toISOString(),
): ShortTermMemoryEntry[] {
  if (mentionedEntities.length === 0) return prev;

  const additions = mentionedEntities.map((entity) => ({ entity, mentionedAt: now }));
  return [...prev, ...additions].slice(-SHORT_TERM_MEMORY_LIMIT);
}
