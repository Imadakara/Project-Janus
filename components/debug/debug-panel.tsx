"use client";

import { useDebug } from "@/lib/debug/debug-context";
import { formatTurnTag } from "@/lib/scenario/debug-explain";
import type { EscalationReason } from "@/lib/scenario/types";

export function DebugPanel() {
  const {
    isDebug,
    panelOpen,
    setPanelOpen,
    logOpen,
    setLogOpen,
    useLlm,
    setUseLlm,
    sessionDebug,
    aiTurnLog,
    clearChat,
  } = useDebug();

  if (!isDebug) return null;

  async function handleClearChat() {
    await clearChat();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        className="debug-panel-trigger border px-2 py-1 text-[10px] font-bold tracking-wide uppercase"
        style={{
          background: "var(--color-debug-bg)",
          borderColor: "var(--color-debug-border)",
          color: "var(--color-debug-text)",
        }}
      >
        {panelOpen ? "✕ DEBUG" : "⚙ DEBUG"}
      </button>

      {panelOpen && (
        <>
          <div
            className="debug-panel-backdrop"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          <div
            className="debug-panel-window flex max-h-[80vh] w-[26rem] max-w-[90vw] flex-col gap-3 overflow-y-auto border p-4 text-xs"
            style={{
              background: "var(--color-debug-bg)",
              borderColor: "var(--color-debug-border)",
              color: "var(--color-debug-text)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">ПАНЕЛЬ ОТЛАДКИ</span>
              <button type="button" onClick={() => setPanelOpen(false)} className="px-1">
                ✕
              </button>
            </div>

            <label className="flex items-center justify-between gap-2">
              <span>Use LLM</span>
              <input
                type="checkbox"
                checked={useLlm}
                onChange={(e) => setUseLlm(e.target.checked)}
              />
            </label>
            <p style={{ color: "var(--color-debug-text-muted)" }}>
              {useLlm
                ? "Переход на LLM разрешён."
                : "Переход на LLM заблокирован — сработавшие триггеры эскалации вернут диагностическое сообщение вместо реального вызова модели."}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLogOpen(!logOpen)}
                className="flex-1 border px-2 py-1"
                style={{ borderColor: "var(--color-debug-border)" }}
              >
                {logOpen ? "СКРЫТЬ ЛОГ" : "ОТКРЫТЬ ДЕБАГ-ЛОГ"}
              </button>
              <button
                type="button"
                onClick={handleClearChat}
                className="flex-1 border px-2 py-1"
                style={{ borderColor: "var(--color-debug-border)" }}
              >
                ОЧИСТИТЬ ЧАТ
              </button>
            </div>

            {logOpen && (
              <div className="flex flex-col gap-2">
                <div>
                  <p style={{ color: "var(--color-debug-text-muted)" }}>— СОСТОЯНИЕ ДВИЖКА —</p>
                  {sessionDebug ? (
                    <div className="flex flex-col gap-0.5">
                      <p>DESYNC SCORE: {sessionDebug.desyncScore}</p>
                      <p>CONFIDENCE TIER: {sessionDebug.lastConfidenceTier ?? "—"}</p>
                      <p>
                        DISPOSITION: trust={sessionDebug.disposition.trust}, tension=
                        {sessionDebug.disposition.tension}
                      </p>
                      <p>ACTIVE CONTEXT: {sessionDebug.activeContext ?? "—"}</p>
                    </div>
                  ) : (
                    <p style={{ color: "var(--color-debug-text-muted)" }}>Нет данных сессии.</p>
                  )}
                </div>

                <div>
                  <p style={{ color: "var(--color-debug-text-muted)" }}>— ИСТОРИЯ ХОДОВ ИИ —</p>
                  <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {aiTurnLog.length === 0 && (
                      <p style={{ color: "var(--color-debug-text-muted)" }}>
                        Пока нет ответов ИИ в этой сессии.
                      </p>
                    )}
                    {aiTurnLog.map((entry) => (
                      <p key={entry.id}>
                        {formatTurnTag({
                          handledByLayer: entry.handledByLayer,
                          matchedIntent: entry.matchedIntent,
                          intentConfidence: entry.intentConfidence,
                          escalationReason: entry.escalationReason as EscalationReason | null,
                          desyncScore: entry.desyncScore,
                        })}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
