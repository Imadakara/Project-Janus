import { ClaudeProvider } from "./claude";
import { LocalLlmProvider } from "./local";
import type { LlmProvider } from "./types";

export { LocalLlmTimeoutError } from "./local";

export type LlmSource = "claude" | "local";

let claudeProvider: LlmProvider | null = null;
let localProvider: LlmProvider | null = null;

function resolveDefaultSource(): LlmSource {
  return process.env.LLM_PROVIDER === "local" ? "local" : "claude";
}

// Активный провайдер по умолчанию выбирается через LLM_PROVIDER в .env (claude по умолчанию),
// без правок вызывающего кода (/lib/scenario, app/api/chat/route.ts). Параметр override — только
// для тумблера «Локальная LLM» панели отладки (player.isDebug, см. app/api/chat/route.ts):
// позволяет переключать источник на лету для конкретного запроса без смены .env и рестарта
// сервера, чтобы сравнивать latency/качество локальной и внешней модели в одной сессии.
export function getLlmProvider(override?: LlmSource): LlmProvider {
  const source = override ?? resolveDefaultSource();
  if (source === "local") {
    if (!localProvider) localProvider = new LocalLlmProvider();
    return localProvider;
  }
  if (!claudeProvider) claudeProvider = new ClaudeProvider();
  return claudeProvider;
}
