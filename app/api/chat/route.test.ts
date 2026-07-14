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
const mockGetJanusState = vi.fn();
const mockLoadSystemStateBrief = vi.fn();

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

// Глобальное состояние ЯНУСа (Фаза 1): мокаются модули с БД; чистые
// resolveDegradationPolicy/buildChatSlots работают по-настоящему от этого снапшота.
vi.mock("@/lib/janus/state", () => ({
  getJanusState: (...args: unknown[]) => mockGetJanusState(...args),
}));

vi.mock("@/lib/janus/brief", () => ({
  loadSystemStateBrief: (...args: unknown[]) => mockLoadSystemStateBrief(...args),
}));

const { POST } = await import("./route");

const NOMINAL_JANUS_STATE = {
  computeMargin: 1.0,
  integrityIndex: 1.0,
  subsystems: { ANALYTICS: "UP", PLANNING: "UP", ARCHIVE: "UP", COMMS: "UP" },
  forecastDeathAt: new Date("2027-03-02T04:12:00Z"),
  forecastP10At: new Date("2027-01-11T00:00:00Z"),
  lambdaEstimate: 1 / 60,
  updatedAt: new Date("2026-07-14T12:00:00Z"),
};

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

function makeRequest(message: string, useLlm?: boolean) {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(useLlm === undefined ? { message } : { message, useLlm }),
  });
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
    mockSearchUnlockedMaterials.mockResolvedValue({ kind: "hits", results: [] });
    mockGetUnlockedModuleKeys.mockResolvedValue([]);
    mockChatMessageFindMany.mockResolvedValue([]);
    mockGetJanusState.mockResolvedValue(NOMINAL_JANUS_STATE);
    mockLoadSystemStateBrief.mockResolvedValue("состояние системы: номинально");
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
      task: {
        tone: "x",
        forbiddenTopics: [],
        allowedHints: [],
        maxSentences: 2,
        fewShotExamples: [],
      },
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
      task: {
        tone: "x",
        forbiddenTopics: [],
        allowedHints: [],
        maxSentences: 4,
        fewShotExamples: [],
      },
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

  it("omits the debug field entirely for a non-debug player", async () => {
    mockResolveResponse.mockReturnValue({
      kind: "deterministic",
      fragment: "детерминированный ответ",
      stateUpdate: STATE_UPDATE,
    });

    const res = await POST(makeRequest("Кто ты?"));
    const data = await res.json();

    expect("debug" in data).toBe(false);
  });

  it("includes layer/intent/session debug info for a debug player", async () => {
    mockGetCurrentPlayer.mockResolvedValue({ ...PLAYER, isDebug: true });
    mockResolveResponse.mockReturnValue({
      kind: "light_llm",
      task: {
        tone: "x",
        forbiddenTopics: [],
        allowedHints: [],
        maxSentences: 2,
        fewShotExamples: [],
      },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 3, lastConfidenceTier: "low" },
      escalationReason: "desync_light",
    });

    const res = await POST(makeRequest("бла бла бла"));
    const data = await res.json();

    expect(data.debug).toEqual({
      handledByLayer: "LIGHT_LLM",
      matchedIntent: INTENT_RESULT.intent,
      intentConfidence: INTENT_RESULT.confidence,
      escalationReason: "desync_light",
      policy: { stage: "NOMINAL", maxLayer: "FULL_LLM", replyDelayMs: 0 },
      session: {
        desyncScore: 3,
        lastConfidenceTier: "low",
        disposition: STATE_UPDATE.disposition,
        activeContext: SESSION.activeContext,
      },
    });
  });

  it("returns 502 when the LLM provider call fails", async () => {
    mockResolveResponse.mockReturnValue({
      kind: "light_llm",
      task: {
        tone: "x",
        forbiddenTopics: [],
        allowedHints: [],
        maxSentences: 2,
        fewShotExamples: [],
      },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 3, lastConfidenceTier: "low" },
      escalationReason: "desync_light",
    });
    mockGenerate.mockRejectedValue(new Error("network down"));

    const res = await POST(makeRequest("бла бла бла"));
    expect(res.status).toBe(502);
  });

  it("blocks a light_llm escalation for a debug player with useLlm=false", async () => {
    mockGetCurrentPlayer.mockResolvedValue({ ...PLAYER, isDebug: true });
    mockResolveResponse.mockReturnValue({
      kind: "light_llm",
      task: {
        tone: "x",
        forbiddenTopics: [],
        allowedHints: [],
        maxSentences: 2,
        fewShotExamples: [],
      },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 3, lastConfidenceTier: "low" },
      escalationReason: "desync_light",
    });

    const res = await POST(makeRequest("бла бла бла", false));
    const data = await res.json();

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockLlmCallLogCreate).not.toHaveBeenCalled();
    expect(data.debug.handledByLayer).toBe("DETERMINISTIC");
    expect(data.debug.escalationReason).toBe("desync_light_blocked_toggle");
    expect(mockChatMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          handledByLayer: "DETERMINISTIC",
          escalationReason: "desync_light_blocked_toggle",
        }),
      }),
    );
  });

  it("blocks a full_llm escalation for a debug player with useLlm=false, skipping history/RAG", async () => {
    mockGetCurrentPlayer.mockResolvedValue({ ...PLAYER, isDebug: true });
    mockResolveResponse.mockReturnValue({
      kind: "full_llm",
      task: {
        tone: "x",
        forbiddenTopics: [],
        allowedHints: [],
        maxSentences: 4,
        fewShotExamples: [],
      },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 6, lastConfidenceTier: "low" },
      escalationReason: "desync_full",
    });

    const res = await POST(makeRequest("синтезируй мне всё", false));
    const data = await res.json();

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSearchUnlockedMaterials).not.toHaveBeenCalled();
    expect(mockChatMessageFindMany).not.toHaveBeenCalled();
    expect(mockLlmCallLogCreate).not.toHaveBeenCalled();
    expect(data.debug.escalationReason).toBe("desync_full_blocked_toggle");
  });

  it("ignores useLlm=false for a non-debug player — LLM is still called", async () => {
    mockResolveResponse.mockReturnValue({
      kind: "light_llm",
      task: {
        tone: "x",
        forbiddenTopics: [],
        allowedHints: [],
        maxSentences: 2,
        fewShotExamples: [],
      },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 3, lastConfidenceTier: "low" },
      escalationReason: "desync_light",
    });

    const res = await POST(makeRequest("бла бла бла", false));
    const data = await res.json();

    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(data.message).toBe("ответ ИИ");
  });

  it("surfaces desync_full_budget_exceeded in the debug payload", async () => {
    mockGetCurrentPlayer.mockResolvedValue({ ...PLAYER, isDebug: true });
    mockIsFullLlmBudgetExceeded.mockReturnValue(true);
    mockResolveResponse.mockReturnValue({
      kind: "deterministic",
      fragment: "отказ, бюджет исчерпан",
      stateUpdate: { ...STATE_UPDATE, desyncScore: 6, lastConfidenceTier: "low" },
      escalationReason: "desync_full_budget_exceeded",
    });

    const res = await POST(makeRequest("ещё один сложный вопрос"));
    const data = await res.json();

    expect(data.debug.escalationReason).toBe("desync_full_budget_exceeded");
    expect(mockChatMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ escalationReason: "desync_full_budget_exceeded" }),
      }),
    );
  });

  it("возвращает replyDelayMs из политики деградации", async () => {
    mockGetJanusState.mockResolvedValue({ ...NOMINAL_JANUS_STATE, computeMargin: 0.85 });
    mockResolveResponse.mockReturnValue({
      kind: "deterministic",
      fragment: "медленный ответ",
      stateUpdate: STATE_UPDATE,
    });

    const res = await POST(makeRequest("Кто ты?"));
    const data = await res.json();

    expect(data.replyDelayMs).toBeGreaterThan(0);
  });

  it("кома (M < 0.2): фиксированный пул до классификации интента, состояние сессии не трогается", async () => {
    mockGetJanusState.mockResolvedValue({ ...NOMINAL_JANUS_STATE, computeMargin: 0.1 });

    const res = await POST(makeRequest("Кто ты?"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockClassifyIntent).not.toHaveBeenCalled();
    expect(mockResolveResponse).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockChatSessionUpdate).not.toHaveBeenCalled();
    expect(data.message).toContain("PULS");
    expect(mockChatMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "AI",
          handledByLayer: "DETERMINISTIC",
          escalationReason: "coma",
        }),
      }),
    );
  });

  it("маркер утраты из RAG перехватывает full_llm в MEMORY_LOST без вызова провайдера", async () => {
    mockResolveResponse.mockReturnValue({
      kind: "full_llm",
      task: {
        tone: "x",
        forbiddenTopics: [],
        allowedHints: [],
        maxSentences: 4,
        fewShotExamples: [],
        systemStateBrief: "",
      },
      stateUpdate: { ...STATE_UPDATE, desyncScore: 6, lastConfidenceTier: "low" },
      escalationReason: "desync_full",
    });
    mockSearchUnlockedMaterials.mockResolvedValue({ kind: "lost", segmentCode: "ARHIV-114" });

    const res = await POST(makeRequest("что было в сводках объекта?"));
    const data = await res.json();

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockLlmCallLogCreate).not.toHaveBeenCalled();
    expect(data.message).toContain("[TODO:");
    expect(mockChatMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          handledByLayer: "DETERMINISTIC",
          escalationReason: "memory_lost",
        }),
      }),
    );
  });
});
