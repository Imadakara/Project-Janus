"use client";

import { useRef, useState, type FormEvent } from "react";
import { ChatExitButton } from "./chat-exit-button";

type MessageLayer = "DETERMINISTIC" | "LIGHT_LLM" | "FULL_LLM";
type ConfidenceTier = "high" | "medium" | "low";

type Message = {
  id: string;
  role: "PLAYER" | "AI";
  content: string;
  handledByLayer?: MessageLayer | null;
  matchedIntent?: string | null;
  intentConfidence?: number | null;
  escalationReason?: string | null;
};

type SessionDebug = {
  desyncScore: number;
  lastConfidenceTier: ConfidenceTier | null;
  disposition: { trust: number; tension: number };
  activeContext: string | null;
};

export function ChatClient({
  initialMessages,
  isDebugUser = false,
  initialSessionDebug = null,
}: {
  initialMessages: Message[];
  isDebugUser?: boolean;
  initialSessionDebug?: SessionDebug | null;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionDebug, setSessionDebug] = useState<SessionDebug | null>(initialSessionDebug);
  const [showDebug, setShowDebug] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setError(null);
    setIsSending(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "PLAYER", content: trimmed },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "ОШИБКА СВЯЗИ.");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "AI",
          content: data.message,
          handledByLayer: data.debug?.handledByLayer ?? null,
          matchedIntent: data.debug?.matchedIntent ?? null,
          intentConfidence: data.debug?.intentConfidence ?? null,
          escalationReason: data.debug?.escalationReason ?? null,
        },
      ]);

      if (data.debug?.session) {
        setSessionDebug(data.debug.session);
      }
    } catch {
      setError("ОШИБКА СВЯЗИ.");
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    }
  }

  return (
    <main className="flex min-h-screen flex-col gap-4 px-6 py-8 sm:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg">ДИАЛОГ С ИИ</h1>
        <div className="flex gap-2">
          {isDebugUser && (
            <button
              type="button"
              onClick={() => setShowDebug((v) => !v)}
              className="border px-3 py-1 text-sm"
              style={{ borderColor: "var(--color-amber-dim)" }}
            >
              {showDebug ? "СКРЫТЬ ДЕБАГ" : "ДЕБАГ"}
            </button>
          )}
          <ChatExitButton />
        </div>
      </div>

      {isDebugUser && showDebug && (
        <div
          className="flex flex-col gap-2 border p-4 text-sm"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          <p className="opacity-70">— СОСТОЯНИЕ ДВИЖКА —</p>
          {sessionDebug ? (
            <>
              <p>DESYNC SCORE: {sessionDebug.desyncScore}</p>
              <p>CONFIDENCE TIER: {sessionDebug.lastConfidenceTier ?? "—"}</p>
              <p>
                DISPOSITION: trust={sessionDebug.disposition.trust}, tension=
                {sessionDebug.disposition.tension}
              </p>
              <p>ACTIVE CONTEXT: {sessionDebug.activeContext ?? "—"}</p>
            </>
          ) : (
            <p className="opacity-70">Нет данных сессии.</p>
          )}

          <p className="mt-2 opacity-70">— ИСТОРИЯ ХОДОВ ИИ —</p>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {messages.filter((m) => m.role === "AI" && m.handledByLayer).length === 0 && (
              <p className="opacity-70">Пока нет ответов ИИ в этой сессии.</p>
            )}
            {messages
              .filter((m) => m.role === "AI" && m.handledByLayer)
              .map((m) => (
                <p key={m.id} className="opacity-90">
                  [{m.handledByLayer}] intent={m.matchedIntent ?? "—"} conf=
                  {m.intentConfidence != null ? m.intentConfidence.toFixed(2) : "—"} escalation=
                  {m.escalationReason ?? "—"}
                </p>
              ))}
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="flex max-h-[60vh] min-h-[40vh] flex-1 flex-col gap-3 overflow-y-auto border p-4"
        style={{ borderColor: "var(--color-amber-dim)" }}
      >
        {messages.length === 0 && <p className="opacity-70">СОЕДИНЕНИЕ ОЖИДАЕТ ВВОДА...</p>}
        {messages.map((m) => (
          <p key={m.id} className="whitespace-pre-wrap">
            <span className="opacity-70">{m.role === "PLAYER" ? "> " : "ЯНУС> "}</span>
            {m.content}
          </p>
        ))}
        {isSending && <p className="opacity-70">ЯНУС ОБРАБАТЫВАЕТ ЗАПРОС...</p>}
      </div>

      {error && <p className="opacity-90">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isSending}
          maxLength={2000}
          autoFocus
          className="flex-1 border bg-transparent px-3 py-2 outline-none disabled:opacity-50"
          style={{ borderColor: "var(--color-amber-dim)" }}
          placeholder="ВВЕДИТЕ СООБЩЕНИЕ..."
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="border px-4 py-2 disabled:opacity-50"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          ОТПРАВИТЬ
        </button>
      </form>
    </main>
  );
}
