"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { AuthModal } from "@/components/auth/AuthModal";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-sm flex-col items-center justify-center gap-5 px-4 py-16 text-center">
          <p className="text-sm font-medium text-foreground">Sign in required</p>
          <p className="text-xs text-muted-foreground">
            This area is only available after you sign in.
          </p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white shadow-subtle transition hover:bg-primary/90"
          >
            Sign in
          </button>
        </div>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </>
    );
  }

  return <>{children}</>;
}
