"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogIn, LogOut, User, Settings, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalChat } from "@/components/chat/GlobalChat";
import { useAuth } from "@/lib/authContext";
import { useProfile } from "@/lib/profileContext";
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, signOut, loading: authLoading } = useAuth();
  const { profile, needsOnboarding } = useProfile();

  const showGlobalChat = useMemo(() => pathname !== "/", [pathname]);
  const displayName =
    profile?.full_name?.trim() ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ||
    user?.email?.split("@")[0] ||
    "User";
  const avatarUrl =
    profile?.avatar_url ||
    (typeof user?.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null) ||
    (typeof user?.user_metadata?.picture === "string" ? user.user_metadata.picture : null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

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

            {/* Auth / user menu */}
            {!authLoading && (
              user ? (
                <div ref={userMenuRef} className="relative hidden sm:block">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
                    title={profile?.email ?? user.email ?? ""}
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-4 w-4 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="h-3.5 w-3.5" aria-hidden />
                    )}
                    <span className="max-w-[96px] truncate">{displayName}</span>
                    <ChevronDown className={cn("h-3 w-3 text-slate-400 transition-transform", userMenuOpen && "rotate-180")} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                      <Link
                        href="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <Settings className="h-3.5 w-3.5 text-slate-400" />
                        My Profile
                        {needsOnboarding && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" />
                        )}
                      </Link>
                      <div className="mx-2 my-1 h-px bg-slate-100" />
                      <button
                        type="button"
                        onClick={() => { setUserMenuOpen(false); void signOut(); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </div>
                  )}
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

              {user && (
                <>
                  <div className="mx-1 my-1 h-px bg-slate-100" />
                  <Link
                    href="/profile"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition",
                      isItemActive(pathname, "/profile")
                        ? "bg-primary/10 text-primary"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    My Profile
                    {needsOnboarding && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMobileOpen(false); void signOut(); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Onboarding nudge banner */}
      {user && needsOnboarding && pathname !== "/profile" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 sm:px-6">
          Complete your profile to personalise your experience.{" "}
          <Link href="/profile" className="font-semibold underline underline-offset-2 hover:text-amber-900">
            Set up now →
          </Link>
        </div>
      )}

      {showGlobalChat && <GlobalChat />}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </>
  );
}
