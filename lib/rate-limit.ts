// Простой in-memory рейт-лимитер (по ключу, например `${scope}:${playerId}`). Для MVP
// (один процесс сервера) этого достаточно; при горизонтальном масштабировании потребуется
// вынести состояние в БД/Redis.

const requestTimestamps = new Map<string, number[]>();

export function isRateLimited(key: string, windowMs: number, maxRequests: number): boolean {
  const now = Date.now();
  const timestamps = (requestTimestamps.get(key) ?? []).filter((ts) => now - ts < windowMs);

  if (timestamps.length >= maxRequests) {
    requestTimestamps.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  requestTimestamps.set(key, timestamps);
  return false;
}
