// Индекс целостности памяти ЯНУСа: доля живого веса среди всех сегментов.
// ТЗ определения не задаёт — принято: CORE весит вдвое больше PERIPHERAL (смерть ядра =
// смерть ЯНУСа, поэтому его деградация должна быть слышнее), DEGRADED-сегмент даёт половину
// своего веса. Пустой реестр = 1.0 (нечему деградировать). Зафиксировано в тех.описании.
// Потребители: lib/janus/state.ts (пересчёт), lib/janus/degradation.ts (пороги спутанности).

export const CORE_WEIGHT = 2;
export const PERIPHERAL_WEIGHT = 1;
export const DEGRADED_FACTOR = 0.5;

export type IntegritySegmentInput = {
  status: "ALIVE" | "DEGRADED" | "DEAD";
  tier: "CORE" | "PERIPHERAL";
};

export function computeIntegrityIndex(segments: IntegritySegmentInput[]): number {
  if (segments.length === 0) return 1.0;

  let totalWeight = 0;
  let aliveWeight = 0;

  for (const segment of segments) {
    const weight = segment.tier === "CORE" ? CORE_WEIGHT : PERIPHERAL_WEIGHT;
    totalWeight += weight;
    if (segment.status === "ALIVE") aliveWeight += weight;
    else if (segment.status === "DEGRADED") aliveWeight += weight * DEGRADED_FACTOR;
  }

  return aliveWeight / totalWeight;
}
