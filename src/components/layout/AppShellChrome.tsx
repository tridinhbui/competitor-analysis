"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogIn, LogOut, User, Settings, ChevronDown, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { useProfile } from "@/lib/profileContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { FinbudProLogo } from "@/components/branding/FinbudProLogo";

const NAV_ITEMS = [
  { href: "/analyze", label: "Quick Analyze" },
  { href: "/data-source", label: "Data Source" },
  { href: "/workspace", label: "Competitor Analysis" },
  { href: "/competitor-dashboard", label: "Competitor Dashboard" },
  { href: "/earnings-analysis", label: "Earnings Script Analyze" },
  { href: "/excel-analyze", label: "Excel Analyze" },
] as const;

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShellChrome() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, signOut, loading: authLoading } = useAuth();
  const { profile, needsOnboarding } = useProfile();

  const displayName =
    profile?.full_name?.trim() ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null) ||
    user?.email?.split("@")[0] ||
    "User";
  const avatarUrl =
    profile?.avatar_url ||
    (typeof user?.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null) ||
    (typeof user?.user_metadata?.picture === "string" ? user.user_metadata.picture : null);
  const showAppNav = Boolean(user) && !authLoading;
  const brandHref = showAppNav ? "/analyze" : "/";
  const pricingHref = "/#pricing";
  const pricingActive = pathname === "/" && currentHash === "#pricing";

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

  useEffect(() => {
    const syncHash = () => setCurrentHash(window.location.hash || "");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-border/90 bg-white/90 px-4 py-2.5 text-xs font-semibold backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={brandHref} className="inline-flex items-center transition hover:opacity-90" aria-label="Strategy Hub home">
              <FinbudProLogo variant="nav" />
            </Link>
            {showAppNav && (
              <>
                <span className="hidden text-border sm:inline">|</span>
                <div className="hidden items-center gap-1 md:flex">
                  {NAV_ITEMS.map((item) => {
                    const active = isItemActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "rounded-full px-2.5 py-1 transition",
                          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Auth / user menu */}
            {!authLoading && (
              user ? (
                <div ref={userMenuRef} className="relative hidden sm:block">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:border-[#d2d5d8] hover:bg-white"
                    title={profile?.email ?? user.email ?? ""}
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
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
                    <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", userMenuOpen && "rotate-180")} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-border bg-white py-1 shadow-lg">
                      <Link
                        href={pricingHref}
                        onClick={() => setUserMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 text-xs font-medium transition hover:bg-secondary",
                          pricingActive ? "bg-primary/10 text-primary" : "text-foreground"
                        )}
                      >
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                        Pricing
                      </Link>
                      <div className="mx-2 my-1 h-px bg-border/60" />
                      <Link
                        href="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary"
                      >
                        <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                        My Profile
                        {needsOnboarding && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" />
                        )}
                      </Link>
                      <div className="mx-2 my-1 h-px bg-border/60" />
                      <button
                        type="button"
                        onClick={() => { setUserMenuOpen(false); void signOut(); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
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
                  className="inline-flex items-center gap-1 rounded-full border border-[#e7c7b7] bg-white px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-[#cc521d]/35 hover:text-[#cc521d]"
                >
                  <LogIn className="h-3 w-3" aria-hidden />
                  Sign in
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition hover:bg-secondary md:hidden"
              aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="mt-2 rounded-xl border border-border bg-white p-2 shadow-elevation md:hidden">
            <div className="grid gap-1">
              {showAppNav &&
                NAV_ITEMS.map((item) => {
                  const active = isItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "rounded-lg px-3 py-2 text-xs transition",
                        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              {!authLoading && !user && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    setAuthOpen(true);
                  }}
                  className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[#e7c7b7] bg-white px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-[#fff6f1] hover:text-[#cc521d]"
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden />
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
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition",
                      pricingActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Pricing
                  </Link>
                  <Link
                    href="/profile"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition",
                      isItemActive(pathname, "/profile")
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
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
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
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

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </>
  );
}
