export type Disposition = { trust: number; tension: number };

export type ConfidenceTier = "high" | "medium" | "low";

export type ShortTermMemoryEntry = { entity: string; mentionedAt: string };

// Зеркалит новые поля ChatSession (см. prisma/schema.prisma) — состояние диалоговой
// сессии, которым владеет Слой 1.
export type ScenarioSessionState = {
  disposition: Disposition;
  activeContext: string | null;
  shortTermMemory: ShortTermMemoryEntry[];
  intentRepeatCount: Record<string, number>;
  desyncScore: number;
  lastConfidenceTier: ConfidenceTier | null;
};

export type ResolveStateUpdate = Pick<
  ScenarioSessionState,
  "disposition" | "intentRepeatCount" | "desyncScore" | "lastConfidenceTier" | "shortTermMemory"
>;
