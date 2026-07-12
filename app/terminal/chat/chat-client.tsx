"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChatExitButton } from "./chat-exit-button";
import { TypedText } from "@/components/terminal/typed-text";
import { useDebug, type AiTurnLogEntry, type SessionDebugState } from "@/lib/debug/debug-context";
import { formatTurnTag, isBlockedByToggle } from "@/lib/scenario/debug-explain";
import type { EscalationReason } from "@/lib/scenario/types";

type MessageLayer = "DETERMINISTIC" | "LIGHT_LLM" | "FULL_LLM";

type Message = {
  id: string;
  role: "PLAYER" | "AI";
  content: string;
  handledByLayer?: MessageLayer | null;
  matchedIntent?: string | null;
  intentConfidence?: number | null;
  escalationReason?: string | null;
  // Известен только для ходов, полученных в текущей живой сессии (не персистится по-сообщённо
  // в БД) — см. lib/scenario/debug-explain.ts.
  desyncScore?: number | null;
  // Побуквенный вывод — только для реплик ИИ, полученных в текущей живой сессии; история,
  // загруженная при монтировании (initialMessages), отображается сразу, иначе весь диалог
  // перепечатывался бы заново при каждом обновлении страницы.
  animate?: boolean;
};

export function ChatClient({
  initialMessages,
  isDebugUser = false,
  initialSessionDebug = null,
}: {
  initialMessages: Message[];
  isDebugUser?: boolean;
  initialSessionDebug?: SessionDebugState | null;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { useLlm, setSessionDebug, pushAiTurn, seedAiTurnLog, registerClearChatHandler } =
    useDebug();

  // Засеиваем контекст панели отладки уже существующей историей — иначе после F5 лог пуст
  // до следующего хода. Один раз при монтировании.
  useEffect(() => {
    if (!isDebugUser) return;
    if (initialSessionDebug) {
      setSessionDebug(initialSessionDebug);
    }
    const entries: AiTurnLogEntry[] = initialMessages
      .filter((m) => m.role === "AI" && m.handledByLayer)
      .map((m) => ({
        id: m.id,
        handledByLayer: m.handledByLayer as MessageLayer,
        matchedIntent: m.matchedIntent ?? null,
        intentConfidence: m.intentConfidence ?? null,
        escalationReason: m.escalationReason ?? null,
        desyncScore: m.desyncScore ?? null,
      }));
    if (entries.length > 0) {
      seedAiTurnLog(entries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    registerClearChatHandler(() => setMessages([]));
    return () => registerClearChatHandler(null);
  }, [registerClearChatHandler]);

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
        body: JSON.stringify({ message: trimmed, useLlm }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "ОШИБКА СВЯЗИ.");
        return;
      }

      const aiMessageId = `ai-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: aiMessageId,
          role: "AI",
          content: data.message,
          handledByLayer: data.debug?.handledByLayer ?? null,
          matchedIntent: data.debug?.matchedIntent ?? null,
          intentConfidence: data.debug?.intentConfidence ?? null,
          escalationReason: data.debug?.escalationReason ?? null,
          desyncScore: data.debug?.session?.desyncScore ?? null,
          animate: true,
        },
      ]);

      if (data.debug) {
        setSessionDebug(data.debug.session);
        pushAiTurn({
          id: aiMessageId,
          handledByLayer: data.debug.handledByLayer,
          matchedIntent: data.debug.matchedIntent,
          intentConfidence: data.debug.intentConfidence,
          escalationReason: data.debug.escalationReason,
          desyncScore: data.debug.session?.desyncScore ?? null,
        });
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
        <ChatExitButton />
      </div>

      <div
        ref={listRef}
        className="flex max-h-[60vh] min-h-[40vh] flex-1 flex-col gap-3 overflow-y-auto border p-4"
        style={{ borderColor: "var(--color-amber-dim)" }}
      >
        {messages.length === 0 && <p className="opacity-70">СОЕДИНЕНИЕ ОЖИДАЕТ ВВОДА...</p>}
        {messages.map((m) => {
          // Дебажная реплика (см. п.5/п.4 задачи): в основном тексте уже содержится вся
          // диагностика, если движок LLM был заблокирован тумблером — дублировать нечем.
          const showDebugAnnotation =
            isDebugUser &&
            m.role === "AI" &&
            !!m.handledByLayer &&
            !isBlockedByToggle(m.escalationReason);

          return (
            <div key={m.id}>
              <p className="whitespace-pre-wrap">
                <span className="opacity-70">{m.role === "PLAYER" ? "> " : "ЯНУС> "}</span>
                {m.role === "AI" && m.animate ? <TypedText text={m.content} /> : m.content}
              </p>
              {showDebugAnnotation && (
                <p
                  className="mt-1 text-xs whitespace-pre-wrap"
                  style={{ color: "var(--color-debug-text)" }}
                >
                  [DEBUG]{" "}
                  {formatTurnTag({
                    handledByLayer: m.handledByLayer as MessageLayer,
                    matchedIntent: m.matchedIntent ?? null,
                    intentConfidence: m.intentConfidence ?? null,
                    escalationReason: (m.escalationReason ?? null) as EscalationReason | null,
                    desyncScore: m.desyncScore ?? null,
                  })}
                </p>
              )}
            </div>
          );
        })}
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
