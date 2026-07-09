import type { ShortTermMemoryEntry } from "./schema";

// MVP-заглушка словаря именованных сущностей сеттинга. TODO: заменить/расширить финальным
// списком от нарративного дизайнера по мере ввода новых персонажей/объектов.
const ENTITY_ALIASES: Record<string, string[]> = {
  ЯНУС: ["янус"],
  АРХИВ: ["архив", "архива", "архиве", "архиву"],
  "ОБЪЕКТ-01": ["объект-01", "объект 01"],
  "СЕКТОР B": ["сектор b", "сектор б"],
};

// \b в JS-регэкспах опирается на \w (только ASCII-буквы), поэтому для кириллицы границы
// слов ищем через разбиение на токены, а не через \bслово\b.
const PRONOUNS = new Set([
  "он",
  "она",
  "оно",
  "они",
  "его",
  "её",
  "их",
  "него",
  "неё",
  "них",
  "этому",
  "это",
]);

// Разрешение местоимений: если в сообщении нет прямого упоминания сущности, но есть
// местоимение и в краткосрочной памяти есть последняя упомянутая сущность — считаем,
// что местоимение ссылается на неё.
export function resolveMentionedEntities(
  message: string,
  shortTermMemory: ShortTermMemoryEntry[],
): string[] {
  const lower = message.toLowerCase();
  const found = new Set<string>();

  for (const [entity, aliases] of Object.entries(ENTITY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) {
      found.add(entity);
    }
  }

  if (found.size === 0 && shortTermMemory.length > 0) {
    const words = lower.split(/[^а-яё]+/iu).filter(Boolean);
    if (words.some((word) => PRONOUNS.has(word))) {
      found.add(shortTermMemory[shortTermMemory.length - 1].entity);
    }
  }

  return Array.from(found);
}
