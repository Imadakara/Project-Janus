// Чистая логика проверки доступа — вынесена отдельно от API-роутов, чтобы её можно было
// покрыть юнит-тестами без БД.

export function hasModuleAccess(unlockedModuleKeys: string[], requiredModuleKey: string): boolean {
  return unlockedModuleKeys.includes(requiredModuleKey);
}
