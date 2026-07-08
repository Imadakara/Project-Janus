import { isRateLimited } from "@/lib/rate-limit";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

export function isTerminalFilesRateLimited(playerId: string): boolean {
  return isRateLimited(`terminal-files:${playerId}`, WINDOW_MS, MAX_REQUESTS_PER_WINDOW);
}
