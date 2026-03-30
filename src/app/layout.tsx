import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import Link from "next/link";
import { GlobalChat } from "@/components/chat/GlobalChat";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dividend IQ · Analyst",
  description: "Intelligent Financial Analysis & Reporting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className="min-h-dvh bg-transparent font-[Inter] text-foreground antialiased">
        <nav className="sticky top-0 z-40 flex h-10 items-center gap-4 border-b border-slate-200/80 bg-white/80 px-4 text-xs font-semibold backdrop-blur-sm sm:px-6">
          <Link href="/" className="text-slate-900 transition hover:text-primary">
            Dividend IQ
          </Link>
          <span className="text-slate-200">|</span>
          <Link href="/" className="text-slate-500 transition hover:text-slate-900">
            Analyze
          </Link>
          <Link href="/workspace" className="text-slate-500 transition hover:text-slate-900">
            Workspace
          </Link>
          <Link href="/data-source" className="text-slate-500 transition hover:text-slate-900">
            Data Source
          </Link>
          <Link href="/overview" className="text-slate-500 transition hover:text-slate-900">
            Overview
          </Link>
          <Link href="/history" className="text-slate-500 transition hover:text-slate-900">
            History
          </Link>
        </nav>
        <main className="min-h-[calc(100dvh-2.5rem)]">{children}</main>
        <GlobalChat />
      </body>
    </html>
  );
}
