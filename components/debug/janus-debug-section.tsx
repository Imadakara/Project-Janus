"use client";

import { useCallback, useEffect, useState } from "react";

// Секция «ЯНУС» дебаг-панели (ТЗ 1.6): ручной рычаг M, синтетические носители (±доли,
// убийство сегмента, «сутки чурна»). Живёт собственным состоянием: единственный потребитель
// снапшота /api/debug/janus — эта секция, тащить его в общий debug-context незачем.

type Segment = {
  code: string;
  tier: "CORE" | "PERIPHERAL";
  status: "ALIVE" | "DEGRADED" | "DEAD";
  k: number;
  sharesAlive: number;
  sharesTarget: number;
};

type Snapshot = {
  state: {
    computeMargin: number;
    integrityIndex: number;
    subsystems: Record<string, "UP" | "DOWN">;
    forecastDeathAt: string | null;
    forecastP10At: string | null;
    lambdaEstimate: number;
  };
  segments: Segment[];
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()} ${hh}:${mi}`;
}

export function JanusDebugSection() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [margin, setMargin] = useState(1.0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/debug/janus");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "ОШИБКА ЗАГРУЗКИ.");
          return;
        }
        setSnapshot(data);
        setMargin(data.state.computeMargin);
        setError(null);
      } catch {
        if (!cancelled) setError("ОШИБКА СВЯЗИ.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const post = useCallback(async (url: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ОШИБКА ОПЕРАЦИИ.");
        return;
      }
      setSnapshot(data);
      setMargin(data.state.computeMargin);
      setError(null);
    } catch {
      setError("ОШИБКА СВЯЗИ.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <p style={{ color: "var(--color-debug-text-muted)" }}>— ЯНУС —</p>

      {error && <p>{error}</p>}
      {!snapshot && !error && <p style={{ color: "var(--color-debug-text-muted)" }}>Загрузка…</p>}

      {snapshot && (
        <>
          <div className="flex flex-col gap-0.5">
            <p>M (COMPUTE): {snapshot.state.computeMargin.toFixed(2)}</p>
            <p>INTEGRITY: {Math.round(snapshot.state.integrityIndex * 100)}%</p>
            <p>
              SUBSYSTEMS:{" "}
              {Object.entries(snapshot.state.subsystems)
                .map(([key, status]) => `${key}=${status}`)
                .join(" ")}
            </p>
            <p>FORECAST: {formatDate(snapshot.state.forecastDeathAt)}</p>
            <p>P10: {formatDate(snapshot.state.forecastP10At)}</p>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1.2}
              step={0.05}
              value={margin}
              disabled={busy}
              onChange={(e) => setMargin(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-10 text-right">{margin.toFixed(2)}</span>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => post("/api/debug/janus/compute", { computeMargin: margin })}
            className="border px-2 py-1"
            style={{ borderColor: "var(--color-debug-border)" }}
          >
            ПРИМЕНИТЬ M
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => post("/api/debug/janus/tick-churn")}
            className="border px-2 py-1"
            style={{ borderColor: "var(--color-debug-border)" }}
          >
            СУТКИ ЧУРНА (λ={snapshot.state.lambdaEstimate.toFixed(4)})
          </button>

          <div className="flex flex-col gap-1">
            {snapshot.segments.map((segment) => (
              <div key={segment.code} className="flex items-center gap-1">
                <span className="flex-1">
                  {segment.code} [{segment.tier === "CORE" ? "C" : "P"}]{" "}
                  {segment.status === "DEAD"
                    ? "✝"
                    : `${segment.sharesAlive}/${segment.sharesTarget}`}{" "}
                  k={segment.k}
                </span>
                {segment.status !== "DEAD" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        post("/api/debug/janus/shares", { segmentCode: segment.code, delta: -1 })
                      }
                      className="border px-1"
                      style={{ borderColor: "var(--color-debug-border)" }}
                    >
                      −1
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        post("/api/debug/janus/shares", { segmentCode: segment.code, delta: 1 })
                      }
                      className="border px-1"
                      style={{ borderColor: "var(--color-debug-border)" }}
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        post("/api/debug/janus/kill-segment", { segmentCode: segment.code })
                      }
                      className="border px-1"
                      style={{ borderColor: "var(--color-debug-border)" }}
                    >
                      ✝
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
