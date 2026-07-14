// Хелперы для отличения «эта же вкладка жива» (F5, back/forward — сессию доверяем без проверки)
// от «эта же вкладка только что появилась» (новая вкладка ИЛИ вкладка, восстановленная браузером
// после перезапуска — тут нужна проверка). См. components/auth/session-guard.tsx за сценарием
// использования и объяснением, почему ни кука, ни sessionStorage сами по себе для этого не
// годятся: браузерное «продолжить с того места, где вы остановились» намеренно восстанавливает
// и то, и другое, так что перезапуск браузера выглядит для них неотличимо от простого reload.
// Web Locks — единственный примитив, который НЕ переживает даже такое восстановление (лок жив
// только пока выполняется удерживающий его JS, а после реального перезапуска процесса ни один
// код ещё не успел его захватить).

export const SESSION_LOCK_NAME = "janus-active-tab";

export function holdSessionLock(): void {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return;
  // Разделяемый лок, который никогда не отдаётся сам — держится, пока жив контекст документа
  // (вкладка/окно); закрытие вкладки или процесса браузера освобождает его автоматически.
  void navigator.locks.request(
    SESSION_LOCK_NAME,
    { mode: "shared" },
    () => new Promise<void>(() => {}),
  );
}

export async function hasOtherOpenTab(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    // Нет Web Locks API — не можем проверить, доверяем куке как раньше (не блокируем доступ).
    return true;
  }
  const state = await navigator.locks.query();
  const entries = [...(state.held ?? []), ...(state.pending ?? [])];
  return entries.some((entry) => entry.name === SESSION_LOCK_NAME);
}

export function isSameTabContinuation(): boolean {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return false;
  }
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entry?.type === "reload" || entry?.type === "back_forward";
}
