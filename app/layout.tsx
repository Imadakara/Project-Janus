import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { CrtScreen } from "@/components/terminal/crt-screen";
import { DebugPanel } from "@/components/debug/debug-panel";
import { DebugProvider } from "@/lib/debug/debug-context";
import { SessionGuard } from "@/components/auth/session-guard";
import { getCurrentPlayer } from "@/lib/auth/server";

const tiny5 = localFont({
  src: "./fonts/Tiny5-CRTRegular.woff2",
  variable: "--font-terminal",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PROJECT JANUS",
  description: "Терминал доступа PROJECT JANUS",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const player = await getCurrentPlayer();

  return (
    <html lang="ru" className={`${tiny5.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <DebugProvider isDebugInitial={player?.isDebug ?? false}>
          <CrtScreen>
            <SessionGuard isAuthenticated={!!player}>{children}</SessionGuard>
          </CrtScreen>
          <DebugPanel />
        </DebugProvider>
      </body>
    </html>
  );
}
