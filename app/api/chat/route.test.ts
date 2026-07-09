import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentPlayer = vi.fn();
const mockIsChatRateLimited = vi.fn();
const mockIsFullLlmBudgetExceeded = vi.fn();
const mockGetOrCreateActiveSession = vi.fn();
const mockChatMessageCreate = vi.fn();
const mockChatMessageFindMany = vi.fn();
const mockChatSessionUpdate = vi.fn();
const mockLlmCallLogCreate = vi.fn();
const mockClassifyIntent = vi.fn();
const mockLoadFragmentsForIntent = vi.fn();
const mockResolveResponse = vi.fn();
const mockGenerate = vi.fn();
const mockBuildPrompt = vi.fn();
const mockApplyGuards = vi.fn();
const mockSearchUnlockedMaterials = vi.fn();
const mockGetUnlockedModuleKeys = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getCurrentPlayer: () => mockGetCurrentPlayer(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chatMessage: {
      create: (...args: unknown[]) => mockChatMessageCreate(...args),
      findMany: (...args: unknown[]) => mockChatMessageFindMany(...args),
    },
    chatSession: {
      update: (...args: unknown[]) => mockChatSessionUpdate(...args),
    },
    llmCallLog: {
      create: (...args: unknown[]) => mockLlmCallLogCreate(...args),
    },
  },
}));

vi.mock("@/lib/chat/session", () => ({
  getOrCreateActiveSession: (...args: unknown[]) => mockGetOrCreateActiveSession(...args),
}));

vi.mock("@/lib/ai/rate-limit", () => ({
  isChatRateLimited: (...args: unknown[]) => mockIsChatRateLimited(...args),
  isFullLlmBudgetExceeded: (...args: unknown[]) => mockIsFullLlmBudgetExceeded(...args),
}));

vi.mock("@/lib/ai/providers", () => ({
  getLlmProvider: () => ({ generate: (...args: unknown[]) => mockGenerate(...args) }),
}));

vi.mock("@/lib/ai/prompt-builder", () => ({
  buildPrompt: (...args: unknown[]) => mockBuildPrompt(...args),
}));

vi.mock("@/lib/ai/guards", () => ({
  applyGuards: (...args: unknown[]) => mockApplyGuards(...args),
}));

vi.mock("@/lib/ai/rag", () => ({
  searchUnlockedMaterials: (...args: unknown[]) => mockSearchUnlockedMaterials(...args),
}));

vi.mock("@/lib/analytics/track", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("@/lib/intent/classify", () => ({
  classifyIntent: (...args: unknown[]) => mockClassifyIntent(...args),
}));

vi.mock("@/lib/scenario/resolve", () => ({
  resolveResponse: (...args: unknown[]) => mockResolveResponse(...args),
}));

vi.mock("@/lib/scenario/repository", () => ({
  loadFragmentsForIntent: (...args: unknown[]) => mockLoadFragmentsForIntent(...args),
}));

vi.mock("@/lib/modules/unlocks", () => ({
  getUnlockedModuleKeys: (...args: unknown[]) => mockGetUnlockedModuleKeys(...args),
}));

const { POST } = await import("./route");

const PLAYER = { id: "player-1", role: "TECHNICIAN" };
const SESSION = {
  id: "session-1",
  disposition: { trust: 0, tension: 0 },
  activeContext: null,
  shortTermMemory: [],
  intentRepeatCount: {},
  desyncScore: 0,
  lastConfidenceTier: null,
};
const INTENT_RESULT = { intent: "ASK_IDENTITY", confidence: 0.9, tags: [], mentionedEntities: [] };
const STATE_UPDATE = {
  disposition: { trust: 0, tension: 0 },
  intentRepeatCount: {},
  desyncScore: 0,
  lastConfidenceTier: "high",
  shortTermMemory: [],
};

function makeRequest(message: string) {
  return new Request("http://test", { method: "POST", body: JSON.stringify({ message }) });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentPlayer.mockResolvedValue(PLAYER);
    mockIsChatRateLimited.mockReturnValue(false);
    mockIsFullLlmBudgetExceeded.mockReturnValue(false);
    mockGetOrCreateActiveSession.mockResolvedValue(SESSION);
    mockChatMessageCreate.mockResolvedValue({});
    mockChatSessionUpdate.mockResolvedValue({});
    mockLlmCallLogCreate.mockResolvedValue({});
    mockClassifyIntent.mockResolvedValue(INTENT_RESULT);
    mockLoadFragmentsForIntent.mockResolvedValue({ NORMAL: ["fragment"], REPEATED: [] });
    mockTrackEvent.mockResolvedValue(undefined);
    mockApplyGuards.mockImplementation((text: string) => text);
    mockBuildPrompt.mockReturnValue({ systemPrompt: "sys", messages: [], maxTokens: 100 });
    mockGenerate.mockResolvedValue({
      text: "ответ ИИ",
      usage: { inputTokens: 10, outputTokens: 5 },
      model: "test-model",
    });
    mockSearchUnlockedMaterials.mockResolvedValue([]);
    mockGetUnlockedModuleKeys.mockResolvedValue([]);
    mockChatMessageFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentPlayer.mockResolvedValue(null);
    const res = await POST(makeRequest("Кто ты?"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockIsChatRateLimited.mockReturnValue(true);
    const res = await POST(makeRequest("Кто ты?"));
    expect(res.status).toBe(429);
  });

  it("uses the deterministic fragment without calling the LLM provider", async () => {
    mockResolveResponse.mockReturnValue({
      kind: "deterministic",
      fragment: "детерминированный ответ",
      stateUpdate: STATE_UPDATE,
    });

    const res = await POST(makeRequest("Кто ты?"));
    const data = await res.json();

    expect(data.message).toBe("детерминированный ответ");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockLlmCallLogCreate).not.toHaveBeenCalled();
    expect(mockChatMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "AI",
          handledByLayer: "DETERMINISTIC",
          content: "детерминированный ответ",
        }),
      }),
    );
  });

  it("calls the LLM provider in light mode without fetching history/RAG", async () => {
    mockResolveResponse.mockReturnValue({
      kind: "light_llm",
      task: { tone: "x", forbiddenTopics: [], allowedHints: [], maxSentences: 2, fewShotExamples: [] },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 3, lastConfidenceTier: "low" },
      escalationReason: "desync_light",
    });

    const res = await POST(makeRequest("бла бла бла"));
    const data = await res.json();

    expect(data.message).toBe("ответ ИИ");
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockSearchUnlockedMaterials).not.toHaveBeenCalled();
    expect(mockChatMessageFindMany).not.toHaveBeenCalled();
    expect(mockLlmCallLogCreate).toHaveBeenCalledOnce();
  });

  it("calls the LLM provider in full mode with history and RAG results", async () => {
    mockResolveResponse.mockReturnValue({
      kind: "full_llm",
      task: { tone: "x", forbiddenTopics: [], allowedHints: [], maxSentences: 4, fewShotExamples: [] },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 6, lastConfidenceTier: "low" },
      escalationReason: "desync_full",
    });

    const res = await POST(makeRequest("синтезируй мне всё"));
    const data = await res.json();

    expect(data.message).toBe("ответ ИИ");
    expect(mockSearchUnlockedMaterials).toHaveBeenCalledOnce();
    expect(mockChatMessageFindMany).toHaveBeenCalledOnce();
    expect(mockLlmCallLogCreate).toHaveBeenCalledOnce();
  });

  it("passes fullLlmBudgetExceeded through to resolveResponse", async () => {
    mockIsFullLlmBudgetExceeded.mockReturnValue(true);
    mockResolveResponse.mockReturnValue({
      kind: "deterministic",
      fragment: "отказ, бюджет исчерпан",
      stateUpdate: STATE_UPDATE,
    });

    await POST(makeRequest("ещё один сложный вопрос"));

    expect(mockResolveResponse).toHaveBeenCalledWith(
      expect.objectContaining({ fullLlmBudgetExceeded: true }),
    );
  });

  it("returns 502 when the LLM provider call fails", async () => {
    mockResolveResponse.mockReturnValue({
      kind: "light_llm",
      task: { tone: "x", forbiddenTopics: [], allowedHints: [], maxSentences: 2, fewShotExamples: [] },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 3, lastConfidenceTier: "low" },
      escalationReason: "desync_light",
    });
    mockGenerate.mockRejectedValue(new Error("network down"));

    const res = await POST(makeRequest("бла бла бла"));
    expect(res.status).toBe(502);
  });
});
