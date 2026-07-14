"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MessageLayer } from "@/app/generated/prisma/client";

export type SessionDebugState = {
  desyncScore: number;
  lastConfidenceTier: "high" | "medium" | "low" | null;
  disposition: { trust: number; tension: number };
  activeContext: string | null;
};

// Сырые поля хода ИИ — один и тот же набор рендерится и в логе панели («ИСТОРИЯ ХОДОВ ИИ»), и
// под репликой бота в чате (app/terminal/chat/chat-client.tsx) через formatTurnTag(), без
// человекочитаемого пересказа, чтобы техническое сообщение не дублировалось в двух формулировках.
export type AiTurnLogEntry = {
  id: string;
  handledByLayer: MessageLayer;
  matchedIntent: string | null;
  intentConfidence: number | null;
  escalationReason: string | null;
  // null — историческое сообщение, загруженное со страницы (не персистится по-сообщённо в БД).
  desyncScore: number | null;
  // Стадия политики деградации (Фаза 1); null — историческое сообщение.
  policyStage?: string | null;
};

const EMPTY_SESSION_DEBUG: SessionDebugState = {
  desyncScore: 0,
  lastConfidenceTier: null,
  disposition: { trust: 0, tension: 0 },
  activeContext: null,
};

type DebugContextValue = {
  isDebug: boolean;
  panelOpen: boolean;
  setPanelOpen: (value: boolean) => void;
  logOpen: boolean;
  setLogOpen: (value: boolean) => void;
  useLlm: boolean;
  setUseLlm: (value: boolean) => void;
  sessionDebug: SessionDebugState | null;
  setSessionDebug: (state: SessionDebugState | null) => void;
  aiTurnLog: AiTurnLogEntry[];
  pushAiTurn: (entry: AiTurnLogEntry) => void;
  seedAiTurnLog: (entries: AiTurnLogEntry[]) => void;
  registerClearChatHandler: (handler: (() => void) | null) => void;
  clearChat: () => Promise<{ ok: boolean; error?: string }>;
};

const DebugContext = createContext<DebugContextValue | null>(null);

export function DebugProvider({
  isDebugInitial,
  children,
}: {
  isDebugInitial: boolean;
  children: ReactNode;
}) {
  const [isDebug, setIsDebug] = useState(isDebugInitial);
  // isDebugInitial меняется при router.refresh() после логина/логаута без размонтирования
  // провайдера (единственный layout в приложении) — обычный useState(isDebugInitial) не
  // подхватил бы новое значение без этого ресинка.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDebug(isDebugInitial);
  }, [isDebugInitial]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [useLlm, setUseLlm] = useState(false);
  const [sessionDebug, setSessionDebug] = useState<SessionDebugState | null>(null);
  const [aiTurnLog, setAiTurnLog] = useState<AiTurnLogEntry[]>([]);
  const clearChatHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isDebug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelOpen(false);
      setLogOpen(false);
    }
  }, [isDebug]);

  const pushAiTurn = useCallback((entry: AiTurnLogEntry) => {
    setAiTurnLog((prev) => [...prev, entry]);
  }, []);

  const seedAiTurnLog = useCallback((entries: AiTurnLogEntry[]) => {
    setAiTurnLog(entries);
  }, []);

  const registerClearChatHandler = useCallback((handler: (() => void) | null) => {
    clearChatHandlerRef.current = handler;
  }, []);

  const clearChat = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/clear", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error ?? "ОШИБКА ОЧИСТКИ ЧАТА." };
      }
      setSessionDebug(EMPTY_SESSION_DEBUG);
      setAiTurnLog([]);
      clearChatHandlerRef.current?.();
      return { ok: true };
    } catch {
      return { ok: false, error: "ОШИБКА СВЯЗИ." };
    }
  }, []);

  const value = useMemo<DebugContextValue>(
    () => ({
      isDebug,
      panelOpen,
      setPanelOpen,
      logOpen,
      setLogOpen,
      useLlm,
      setUseLlm,
      sessionDebug,
      setSessionDebug,
      aiTurnLog,
      pushAiTurn,
      seedAiTurnLog,
      registerClearChatHandler,
      clearChat,
    }),
    [
      isDebug,
      panelOpen,
      logOpen,
      useLlm,
      sessionDebug,
      aiTurnLog,
      pushAiTurn,
      seedAiTurnLog,
      registerClearChatHandler,
      clearChat,
    ],
  );

  return <DebugContext.Provider value={value}>{children}</DebugContext.Provider>;
}

export function useDebug(): DebugContextValue {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error("useDebug must be used within a DebugProvider");
  }
  return context;
}
