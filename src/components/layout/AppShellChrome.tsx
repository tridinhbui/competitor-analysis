"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogIn, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalChat } from "@/components/chat/GlobalChat";
import { useAuth } from "@/lib/authContext";
import { AuthModal } from "@/components/auth/AuthModal";

const NAV_ITEMS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/data-source", label: "Data Source" },
  { href: "/workspace", label: "Workspace" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/history", label: "History" },
] as const;

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/#pricing") return pathname === "/";
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShellChrome() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const { user, signOut, loading: authLoading } = useAuth();

  const showGlobalChat = useMemo(() => pathname !== "/", [pathname]);

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 px-4 py-2.5 text-xs font-semibold backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-900 transition hover:text-primary">
              Dividend IQ
            </Link>
            <span className="hidden text-slate-200 sm:inline">|</span>
            <div className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => {
                const active = isItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-full px-2.5 py-1 transition",
                      active ? "bg-primary/10 text-primary" : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/analyze"
              className="hidden rounded-full bg-gradient-to-r from-primary to-[oklch(0.48_0.16_290)] px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-95 sm:inline-flex"
            >
              Analyze now
            </Link>

            {/* Auth button */}
            {!authLoading && (
              user ? (
                <div className="hidden items-center gap-1.5 sm:flex">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                    title={user.email ?? ""}
                  >
                    <User className="h-3 w-3" aria-hidden />
                    {user.email?.split("@")[0]}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:text-red-500"
                    title="Sign out"
                  >
                    <LogOut className="h-3 w-3" aria-hidden />
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:text-primary sm:inline-flex"
                >
                  <LogIn className="h-3 w-3" aria-hidden />
                  Sign in
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 md:hidden"
              aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="mt-2 rounded-xl border border-slate-200/80 bg-white p-2 shadow-elevation md:hidden">
            <div className="grid gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs transition",
                      active ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/analyze"
                onClick={() => setMobileOpen(false)}
                className="mt-1 inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
              >
                Analyze now
              </Link>
            </div>
          </div>
        )}
      </nav>

      {showGlobalChat && <GlobalChat />}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </>
  );
}
