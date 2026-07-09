// Дешёвые regex/словарные эвристики поверх основного intent'а — не требуют эмбеддинга.
// Словарные списки — MVP-заглушки, TODO: расширить финальным списком от нарративного
// дизайнера.

const NEGATION_MARKERS = [
  "не об этом",
  "не про это",
  "я не про",
  "неправильно",
  "не так",
  "опять не",
  "снова не",
  "я же спросил",
];

const RUDE_MARKERS = ["дурак", "тупой", "идиот", "заткнись", "бестолковый", "тупая железка"];

const POLITE_MARKERS = ["пожалуйста", "спасибо", "будьте добры", "извини", "извините"];

export function extractTags(message: string): string[] {
  const lower = message.toLowerCase();
  const tags: string[] = [];

  if (message.includes("?")) tags.push("interrogation");
  if (NEGATION_MARKERS.some((marker) => lower.includes(marker))) tags.push("negation");
  if (RUDE_MARKERS.some((marker) => lower.includes(marker))) tags.push("rude");
  if (POLITE_MARKERS.some((marker) => lower.includes(marker))) tags.push("polite");

  return tags;
}
