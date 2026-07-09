import type { Disposition } from "./types";

// Единственный владелец мутации disposition — ни Слой 2 (/lib/intent), ни Слой 3
// (/lib/ai) не пишут в это состояние напрямую. Таблица дельт — MVP-заглушка,
// TODO: калибровать вместе с нарративным дизайнером.
const TAG_DELTAS: Record<string, Partial<Disposition>> = {
  polite: { trust: 1 },
  rude: { trust: -1, tension: 2 },
  negation: { tension: 1 },
};

export function applyDispositionDelta(disposition: Disposition, tags: string[]): Disposition {
  let { trust, tension } = disposition;

  for (const tag of tags) {
    const delta = TAG_DELTAS[tag];
    if (!delta) continue;
    trust += delta.trust ?? 0;
    tension += delta.tension ?? 0;
  }

  return { trust, tension };
}
