"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Экран PULS.EXE — монитор жизненных показателей (ТЗ 1.5, переработан Фазой 2 — 2.5).
// Поллинг вместо SSE (вне рамок фазы): дата отказа зафиксирована и не сдвигается сама по
// себе, но сегменты/подсистемы меняются от действий с дебаг-панели, и это обязано быть
// видно на глазах.
const POLL_INTERVAL_MS = 5000;

type SubsystemStatus = "UP" | "DOWN";

type VitalsData = {
  computeMargin: number;
  computeMarginOverride: boolean;
  integrityIndex: number;
  subsystems: Record<string, SubsystemStatus>;
  countdown: { deathAt: string; remainingMs: number; isDead: boolean; coreDead: boolean };
  salvage: { total: number; salvaged: number; percent: number };
  lossCount: number;
  degradingSegments: Array<{ code: string; title: string; dieAt: string | null }>;
  coreSegments: Array<{
    code: string;
    title: string;
    status: "ALIVE" | "DEGRADED" | "DEAD";
    sharesAlive: number;
    sharesTarget: number;
    k: number;
  }>;
  recentLosses: Array<{ segmentCode: string; title: string; diedAt: string }>;
};

// Тот же фиксированный формат, что в слотах диалога (lib/janus/slots.ts) — единый вид дат
// терминала, независимый от локали браузера.
function formatDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()} ${hh}:${mi}`;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days} СУТ ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const SUBSYSTEM_LABELS: Record<string, string> = {
  ANALYTICS: "АНАЛИТИКА",
  PLANNING: "ПЛАНИРОВАНИЕ",
  ARCHIVE: "АРХИВ",
  COMMS: "СВЯЗЬ",
};

export function VitalsScreen() {
  const [data, setData] = useState<VitalsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Тикающий локально остаток — пересчитывается от последнего серверного remainingMs, чтобы
  // отсчёт не «стоял на месте» между poll'ами (сервер опрашивается раз в 5с, тикер — раз в с).
  const [localRemainingMs, setLocalRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/terminal/vitals");
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(payload.error ?? "ОШИБКА СВЯЗИ.");
          return;
        }
        setData(payload);
        setLocalRemainingMs(payload.countdown.remainingMs);
        setError(null);
      } catch {
        if (!cancelled) setError("ОШИБКА СВЯЗИ.");
      }
    }

    void load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const hasLocalRemaining = localRemainingMs !== null;
  useEffect(() => {
    if (!hasLocalRemaining) return;
    const tick = setInterval(() => {
      setLocalRemainingMs((ms) => (ms === null ? null : Math.max(0, ms - 1000)));
    }, 1000);
    return () => clearInterval(tick);
  }, [hasLocalRemaining]);

  return (
    <main className="flex min-h-screen flex-col gap-6 px-6 py-8 sm:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg">PULS.EXE — ЖИЗНЕННЫЕ ПОКАЗАТЕЛИ СИСТЕМЫ</h1>
        <Link
          href="/terminal"
          className="border px-3 py-1"
          style={{ borderColor: "var(--color-amber-dim)" }}
        >
          ВЫХОД
        </Link>
      </div>

      {error && <p className="opacity-90">{error}</p>}
      {!data && !error && <p className="opacity-70">СЧИТЫВАНИЕ ПОКАЗАТЕЛЕЙ...</p>}

      {data && (
        <>
          <section className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
            <p className="mb-2 opacity-70">— ВРЕМЯ ДО ОТКАЗА —</p>
            {data.countdown.coreDead ? (
              <p className="text-lg">ОТКАЗ ЯДРА ЗАФИКСИРОВАН.</p>
            ) : data.countdown.isDead ? (
              <p className="text-lg">СРОК ИСТЁК.</p>
            ) : (
              <>
                <p className="text-2xl">{formatRemaining(localRemainingMs ?? data.countdown.remainingMs)}</p>
                <p className="opacity-70">ДАТА ОТКАЗА: {formatDate(data.countdown.deathAt)}</p>
              </>
            )}
          </section>

          <section className="flex flex-wrap gap-6">
            <div className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
              <p className="opacity-70">ЗАПАС МОЩНОСТИ</p>
              <p className="text-lg">
                {percent(data.computeMargin)}
                {data.computeMarginOverride && <span className="opacity-70"> (РУЧНОЙ РЕЖИМ)</span>}
              </p>
            </div>
            <div className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
              <p className="opacity-70">ЦЕЛОСТНОСТЬ ПАМЯТИ</p>
              <p className="text-lg">{percent(data.integrityIndex)}</p>
            </div>
            <div className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
              <p className="opacity-70">СПАСЕНО</p>
              <p className="text-lg">
                {percent(data.salvage.percent)} ({data.salvage.salvaged}/{data.salvage.total})
              </p>
            </div>
            <div className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
              <p className="opacity-70">УТРАТ ЗАФИКСИРОВАНО</p>
              <p className="text-lg">{data.lossCount}</p>
            </div>
            <div className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
              <p className="opacity-70">ПОДСИСТЕМЫ</p>
              {Object.entries(data.subsystems).map(([key, status]) => (
                <p key={key}>
                  {SUBSYSTEM_LABELS[key] ?? key}:{" "}
                  <span style={status === "DOWN" ? { opacity: 0.5 } : undefined}>
                    {status === "UP" ? "В РАБОТЕ" : "ПОГАШЕНА"}
                  </span>
                </p>
              ))}
            </div>
          </section>

          <section className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
            <p className="mb-2 opacity-70">— БЛИЖАЙШИЕ УТРАТЫ (ЗАПИСЬ ОСЫПАЕТСЯ) —</p>
            {data.degradingSegments.length === 0 && (
              <p className="opacity-70">НЕТ СЕГМЕНТОВ БЛИЗКО К УТРАТЕ.</p>
            )}
            {data.degradingSegments.map((segment) => (
              <p key={segment.code}>
                {segment.code} — {segment.title}
                {segment.dieAt && <span className="opacity-70"> (до {formatDate(segment.dieAt)})</span>}
              </p>
            ))}
          </section>

          <section className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
            <p className="mb-2 opacity-70">— СЕГМЕНТЫ ЯДРА —</p>
            {data.coreSegments.length === 0 && <p className="opacity-70">РЕЕСТР ПУСТ.</p>}
            {data.coreSegments.map((segment) => (
              <p key={segment.code}>
                {segment.code} [{segment.status}] ДОЛИ: {segment.sharesAlive}/{segment.sharesTarget}{" "}
                (ПОРОГ k={segment.k}) — {segment.title}
              </p>
            ))}
          </section>

          <section className="border p-4" style={{ borderColor: "var(--color-amber-dim)" }}>
            <p className="mb-2 opacity-70">— ПОСЛЕДНИЕ ПОТЕРИ —</p>
            {data.recentLosses.length === 0 && (
              <p className="opacity-70">ПОТЕРЬ НЕ ЗАФИКСИРОВАНО.</p>
            )}
            {data.recentLosses.map((loss) => (
              <p key={`${loss.segmentCode}-${loss.diedAt}`}>
                {formatDate(loss.diedAt)} — {loss.segmentCode}: {loss.title}
              </p>
            ))}
            <p className="mt-2">
              <Link href="/terminal/losses" className="underline">
                ПОЛНАЯ КЊИГА ГУБИТАКА →
              </Link>
            </p>
          </section>
        </>
      )}
    </main>
  );
}
