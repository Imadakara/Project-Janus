import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProvider } from "./types";

const mockAnthropicCreate = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: () => ({
    messages: { create: (...args: unknown[]) => mockAnthropicCreate(...args) },
  }),
  CHAT_MODEL: "claude-sonnet-5",
}));

const { ClaudeProvider } = await import("./claude");
const { LocalLlmProvider, LocalLlmTimeoutError } = await import("./local");

const originalFetch = global.fetch;
const mockFetch = vi.fn();

// Один и тот же набор ассертов над обоими провайдерами через общий контракт
// LlmProvider — тест должен ломаться, если общий интерфейс перестанет быть
// провайдер-агностичным.
describe.each([
  {
    name: "ClaudeProvider",
    createProvider: (): LlmProvider => new ClaudeProvider(),
    arrangeSuccess: (text: string, inputTokens: number, outputTokens: number) => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: "text", text }],
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      });
    },
  },
  {
    name: "LocalLlmProvider",
    createProvider: (): LlmProvider => new LocalLlmProvider(),
    arrangeSuccess: (text: string, inputTokens: number, outputTokens: number) => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: text } }],
          usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens },
        }),
      });
    },
  },
])("$name", ({ createProvider, arrangeSuccess }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_LLM_BASE_URL = "http://localhost:9000";
    process.env.LOCAL_LLM_MODEL = "qwen-test";
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns generated text and usage through the shared LlmProvider contract", async () => {
    arrangeSuccess("Ответ терминала.", 120, 40);
    const provider = createProvider();

    const result = await provider.generate({
      systemPrompt: "system prompt",
      messages: [{ role: "user", content: "Кто ты?" }],
      maxTokens: 100,
    });

    expect(result.text).toBe("Ответ терминала.");
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40 });
    expect(typeof result.model).toBe("string");
  });
});

// Поведение, специфичное только для LocalLlmProvider (усиленный промпт для слабых 3-4B
// моделей, лимит ожидания) — не часть общего контракта LlmProvider, поэтому вне describe.each.
describe("LocalLlmProvider — усиление промпта и таймаут", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_LLM_BASE_URL = "http://localhost:9000";
    process.env.LOCAL_LLM_MODEL = "qwen-test";
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("добавляет усиливающий блок правил поверх переданного systemPrompt", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ответ" } }], usage: {} }),
    });
    const provider = new LocalLlmProvider();

    await provider.generate({ systemPrompt: "БАЗОВЫЙ ПРОМПТ ИЗ prompt-builder.ts", messages: [], maxTokens: 100 });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const systemMessage = body.messages[0];

    expect(systemMessage.role).toBe("system");
    expect(systemMessage.content).toContain("БАЗОВЫЙ ПРОМПТ ИЗ prompt-builder.ts");
    // Усиление держит роль (не признаваться, что модель) и запрещает выдумывать факты — те же
    // правила, что проверялись вручную в experiments/llm-bench/.
    expect(systemMessage.content).toContain("ЯНУС");
    expect(systemMessage.content).toContain("НИКОГДА не придумывай факты");
  });

  it("бросает LocalLlmTimeoutError, если сервер не ответил за 60 секунд", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: unknown, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const abortError = new Error("The operation was aborted.");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    );
    const provider = new LocalLlmProvider();

    const pending = provider.generate({ systemPrompt: "x", messages: [], maxTokens: 100 });
    const assertion = expect(pending).rejects.toThrow(LocalLlmTimeoutError);
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });
});
