import { INTENT_REPEAT_THRESHOLD } from "./thresholds";

export function nextRepeatCount(
  counts: Record<string, number>,
  intentCode: string,
): Record<string, number> {
  return { ...counts, [intentCode]: (counts[intentCode] ?? 0) + 1 };
}

export function shouldUseRepeatedPool(count: number): boolean {
  return count >= INTENT_REPEAT_THRESHOLD;
}
