"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_SPEED_MS = 20;

/**
 * Побуквенный вывод текста — эмуляция медленного терминала старого компьютера.
 * `instant` — булев флаг на случай, если для конкретного текстового поля анимация не нужна
 * (см. CLAUDE.md: названия кнопок и файлов должны отображаться сразу, а не посимвольно).
 */
export function TypedText({
  text,
  speed = DEFAULT_SPEED_MS,
  instant = false,
  className,
  onDone,
}: {
  text: string;
  speed?: number;
  instant?: boolean;
  className?: string;
  onDone?: () => void;
}) {
  const [visibleLength, setVisibleLength] = useState(instant ? text.length : 0);
  // onDone кладём в ref, а не в зависимости эффекта — иначе инлайн-колбэк из родителя
  // пересоздавался бы каждый рендер и перезапускал набор текста заново. Обновление ref —
  // в эффекте, не в теле рендера (react-hooks/refs).
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (instant || prefersReducedMotion || text.length === 0) {
      // Синхронный setState здесь намеренный: анимация — внешняя система (таймер), сброс
      // видимой длины при смене text/instant и есть её синхронизация (прецедент подавления
      // правила — lib/debug/debug-context.tsx).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleLength(text.length);
      onDoneRef.current?.();
      return;
    }

    setVisibleLength(0);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisibleLength(i);
      if (i >= text.length) {
        clearInterval(interval);
        onDoneRef.current?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, instant, speed]);

  return <span className={className}>{text.slice(0, visibleLength)}</span>;
}
