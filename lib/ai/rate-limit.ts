import { isRateLimited } from "@/lib/rate-limit";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

export function isChatRateLimited(playerId: string): boolean {
  return isRateLimited(`chat:${playerId}`, WINDOW_MS, MAX_REQUESTS_PER_WINDOW);
}
