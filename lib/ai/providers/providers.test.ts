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
const { LocalLlmProvider } = await import("./local");

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
