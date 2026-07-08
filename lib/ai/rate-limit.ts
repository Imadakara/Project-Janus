// Простой in-memory рейт-лимитер на игрока. Для MVP (один процесс сервера) этого достаточно;
// при горизонтальном масштабировании потребуется вынести состояние в БД/Redis.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

const requestTimestamps = new Map<string, number[]>();

export function isRateLimited(playerId: string): boolean {
  const now = Date.now();
  const timestamps = (requestTimestamps.get(playerId) ?? []).filter((ts) => now - ts < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    requestTimestamps.set(playerId, timestamps);
    return true;
  }

  timestamps.push(now);
  requestTimestamps.set(playerId, timestamps);
  return false;
}
