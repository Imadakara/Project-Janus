import type { Metadata } from "next";
import { VT323 } from "next/font/google";
import "./globals.css";
import { CrtScreen } from "@/components/terminal/crt-screen";

const vt323 = VT323({
  variable: "--font-terminal",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "PROJECT JANUS",
  description: "Терминал доступа PROJECT JANUS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${vt323.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <CrtScreen>{children}</CrtScreen>
      </body>
    </html>
  );
}
