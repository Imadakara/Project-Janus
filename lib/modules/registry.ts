// Реестр командных модулей терминала. Ключи должны совпадать с записями CommandModule в БД.
// Полностью реализованные в MVP модули перечислены в IMPLEMENTED_MODULE_KEYS — остальные
// (SEARCH, MEMORY_MANAGER, MAP_VIEWER и т.д.) существуют только как записи в БД/реестре и
// дают игровое сообщение об отказе доступа вместо реальной функциональности.

export const IMPLEMENTED_MODULE_KEYS = [
  "FILE_MANAGER",
  "FILE_ANALYZER",
  "TEXT_VIEWER",
  "CHESS",
  "PULS",
  "JOURNAL",
] as const;

export type ImplementedModuleKey = (typeof IMPLEMENTED_MODULE_KEYS)[number];

export function isModuleImplemented(key: string): key is ImplementedModuleKey {
  return (IMPLEMENTED_MODULE_KEYS as readonly string[]).includes(key);
}
