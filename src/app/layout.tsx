import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
    <html lang="en" className={`${inter.variable} light`} style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className={`${inter.className} min-h-dvh bg-transparent text-foreground antialiased`}>
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
        </nav>
        <main className="min-h-[calc(100dvh-2.5rem)]">{children}</main>
      </body>
    </html>
  );
}
