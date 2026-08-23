"use client";

import { useEffect, useState } from "react";

// Постоянный элемент интерфейса терминала — обратный отсчёт до DEATH_AT (ТЗ 2.5). Живёт в
// корневом layout (не в /terminal/vitals), поэтому виден на любом экране терминала. Отдельный
// лёгкий endpoint вместо /api/terminal/vitals: этот виджет опрашивается со всех страниц сразу,
// а /api/terminal/vitals на каждый вызов гоняет планировщик утрат (reaper.ts) — незачем платить
// эту цену только ради тикающих цифр в углу.
const POLL_INTERVAL_MS = 30000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}С ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function DeathCountdown() {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [isDeadFlag, setIsDeadFlag] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/terminal/countdown");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setRemainingMs(data.remainingMs);
        setIsDeadFlag(data.isDead);
      } catch {
        // Уголок отсчёта не критичен для работы терминала — молча пропускаем сбой связи,
        // следующий poll подхватит сам.
      }
    }

    void load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const hasRemaining = remainingMs !== null;
  useEffect(() => {
    if (!hasRemaining) return;
    const tick = setInterval(() => {
      setRemainingMs((ms) => (ms === null ? null : Math.max(0, ms - 1000)));
    }, 1000);
    return () => clearInterval(tick);
  }, [hasRemaining]);

  if (remainingMs === null) return null;

  return (
    <div
      className="fixed top-2 left-2 z-40 text-xs opacity-70"
      style={{ color: "var(--color-amber-dim)" }}
    >
      {isDeadFlag ? "СРОК ИСТЁК" : formatRemaining(remainingMs)}
    </div>
  );
}
