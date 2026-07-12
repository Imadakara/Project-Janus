"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JUST_AUTHENTICATED_KEY } from "@/lib/auth/boot-flag";
import { hasOtherOpenTab, holdSessionLock, isSameTabContinuation } from "@/lib/auth/session-guard";

// Требование: закрыл вкладку/браузер и открыл сайт заново — нужен повторный вход; открыл
// сайт в ещё одной вкладке, пока первая жива, — сессия должна сохраниться. Куки одни этого не
// умеют: у браузеров есть режим «продолжить с того места, где вы остановились», который
// намеренно переживает даже полный перезапуск процесса (см. lib/auth/session-guard.ts). Поэтому
// доступ к уже аутентифицированной странице (player есть в куке) дополнительно проверяется здесь
// перед отрисовкой: F5/навигация назад в этой же вкладке — доверяем сразу; свежий логин (флаг
// JUST_AUTHENTICATED_KEY) — тоже; иначе — спрашиваем через Web Locks API, держит ли лок какая-то
// другая уже открытая вкладка, и только тогда пускаем, либо разлогиниваем и отправляем на /login.
export function SessionGuard({
  isAuthenticated,
  children,
}: {
  isAuthenticated: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    if (sessionStorage.getItem(JUST_AUTHENTICATED_KEY) || isSameTabContinuation()) {
      holdSessionLock();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerified(true);
      return;
    }

    let cancelled = false;
    hasOtherOpenTab().then((stillOpen) => {
      if (cancelled) return;
      if (stillOpen) {
        holdSessionLock();
        setVerified(true);
        return;
      }
      fetch("/api/auth/logout", { method: "POST" }).finally(() => {
        router.push("/login");
        router.refresh();
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return <>{children}</>;
  if (!verified) return null;
  return <>{children}</>;
}
