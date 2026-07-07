"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogIn, LogOut, User, Settings, ChevronDown, CreditCard, ChevronRight, CalendarDays, LayoutDashboard, BriefcaseBusiness, Grid2x2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { useProfile } from "@/lib/profileContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { FinbudProLogo } from "@/components/branding/FinbudProLogo";

const NAV_ITEMS = [
  { href: "/analyze", label: "Analyze", icon: LayoutDashboard },
  { href: "/excel-analyze", label: "Excel Analysis", icon: Grid2x2 },
] as const;

const MORE_NAV_ITEMS = [
  { href: "/workspace", label: "Workspace", icon: BriefcaseBusiness },
  { href: "/earnings-analysis", label: "Earnings Scripts", icon: Grid2x2 },
] as const;

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function AppShellChrome() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, signOut, loading: authLoading } = useAuth();
  const { profile, needsOnboarding } = useProfile();
  const userMeta = user?.user_metadata;

  const displayName =
    readMetaString(userMeta, "full_name") ||
    readMetaString(userMeta, "name") ||
    profile?.full_name?.trim() ||
    user?.email?.split("@")[0] ||
    "User";
  const avatarUrl =
    readMetaString(userMeta, "avatar_url") ||
    readMetaString(userMeta, "picture") ||
    profile?.avatar_url ||
    null;
  const showAppNav = Boolean(user) && !authLoading;
  const brandHref = showAppNav ? "/analyze" : "/";
  const pricingHref = "/#pricing";
  const pricingActive = pathname === "/" && currentHash === "#pricing";

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setMoreMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  useEffect(() => {
    const syncHash = () => setCurrentHash(window.location.hash || "");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-border/80 bg-white/92 px-4 py-3 text-sm font-semibold backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={brandHref} className="inline-flex items-center transition hover:opacity-90" aria-label="Competitor Analysis home">
              <FinbudProLogo variant="nav" />
            </Link>
            {showAppNav && (
              <>
                <span className="hidden h-8 w-px bg-border/70 sm:inline" />
                <div className="hidden items-center gap-2 md:flex">
                  {NAV_ITEMS.map((item) => {
                    const active = isItemActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "rounded-full border px-4 py-2 text-[13px] font-semibold transition",
                          active
                            ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                            : "border-transparent bg-white/0 text-muted-foreground hover:border-border/70 hover:bg-white hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </Link>
                    );
                  })}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMoreMenuOpen((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-4 py-2 text-[13px] font-semibold transition",
                        MORE_NAV_ITEMS.some((item) => isItemActive(pathname, item.href))
                          ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                          : "border-transparent bg-white/0 text-muted-foreground hover:border-border/70 hover:bg-white hover:text-foreground"
                      )}
                    >
                      More
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", moreMenuOpen && "rotate-180")} />
                    </button>
                    {moreMenuOpen && (
                      <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-border/80 bg-white py-2 shadow-[0_14px_32px_rgba(15,23,42,0.12)]">
                        {MORE_NAV_ITEMS.map((item) => {
                          const active = isItemActive(pathname, item.href);
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setMoreMenuOpen(false)}
                              className={cn(
                                "flex items-center justify-between px-4 py-2.5 text-sm font-medium transition hover:bg-secondary/70",
                                active ? "bg-primary/10 text-primary" : "text-foreground"
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <item.icon className="h-3.5 w-3.5" />
                                {item.label}
                              </span>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Auth / user menu */}
            {!authLoading && (
              <Link
                href="/earnings-calendar"
                className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-white px-4 py-2 text-[13px] font-semibold text-foreground transition hover:border-[#d2d5d8] hover:bg-secondary sm:inline-flex"
              >
                <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                Earnings Calendar
              </Link>
            )}
            {!authLoading && (
              user ? (
                <div ref={userMenuRef} className="relative hidden sm:block">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary px-4 py-2 text-[13px] font-semibold text-foreground transition hover:border-[#d2d5d8] hover:bg-white"
                    title={profile?.email ?? user.email ?? ""}
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-5 w-5 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="h-4 w-4" aria-hidden />
                    )}
                    <span className="max-w-[120px] truncate">{displayName}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", userMenuOpen && "rotate-180")} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-border/80 bg-white py-2 shadow-[0_14px_32px_rgba(15,23,42,0.12)]">
                      <Link
                        href={pricingHref}
                        onClick={() => setUserMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition hover:bg-secondary/70",
                          pricingActive ? "bg-primary/10 text-primary" : "text-foreground"
                        )}
                      >
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        Pricing
                      </Link>
                      <div className="mx-3 my-1.5 h-px bg-border/60" />
                      <Link
                        href="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary/70"
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        My Profile
                        {needsOnboarding && (
                          <span className="ml-auto h-2 w-2 rounded-full bg-amber-400" />
                        )}
                      </Link>
                      <div className="mx-3 my-1.5 h-px bg-border/60" />
                      <button
                        type="button"
                        onClick={() => { setUserMenuOpen(false); void signOut(); }}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#e7c7b7] bg-white px-4 py-2 text-[13px] font-semibold text-muted-foreground transition hover:border-[#cc521d]/35 hover:text-[#cc521d]"
                >
                  <LogIn className="h-4 w-4" aria-hidden />
                  Sign in
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-white text-muted-foreground transition hover:bg-secondary md:hidden"
              aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="mt-2 rounded-2xl border border-border/80 bg-white p-3 shadow-elevation md:hidden">
            <div className="grid gap-1">
              {showAppNav &&
                [...NAV_ITEMS, ...MORE_NAV_ITEMS].map((item) => {
                  const active = isItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm transition",
                        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              {showAppNav && (
                <Link
                  href="/earnings-calendar"
                  onClick={() => setMobileOpen(false)}
                  className="mt-1 inline-flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
                >
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Earnings Calendar
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              )}
              {!authLoading && !user && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    setAuthOpen(true);
                  }}
                  className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#e7c7b7] bg-white px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-[#fff6f1] hover:text-[#cc521d]"
                >
                  <LogIn className="h-4 w-4" aria-hidden />
                  Sign in
                </button>
              )}

              {user && (
                <>
                  <div className="mx-1 my-1 h-px bg-border/60" />
                  <Link
                    href={pricingHref}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm transition",
                      pricingActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <CreditCard className="h-4 w-4" />
                    Pricing
                  </Link>
                  <Link
                    href="/profile"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm transition",
                      isItemActive(pathname, "/profile")
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Settings className="h-4 w-4" />
                    My Profile
                    {needsOnboarding && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-amber-400" />
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMobileOpen(false); void signOut(); }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-sm text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                  >
                    <LogOut className="h-4 w-4" />
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

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </>
  );
}
