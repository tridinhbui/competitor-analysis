"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { GOOGLE_OAUTH_NEXT_KEY, getSafeNextPath } from "@/lib/authRedirect";

function AuthCallbackCard({ error, onBackHome }: { error: string | null; onBackHome?: () => void }) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-7 text-center shadow-xl">
        {error ? (
          <>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Google sign-in failed
            </h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={onBackHome}
              className="mt-5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
              Back to home
            </button>
          </>
        ) : (
          <>
            <Loader2
              className="mx-auto h-6 w-6 animate-spin text-slate-400"
              aria-label="Finishing sign-in"
            />
            <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
              Finishing your sign-in
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              We&apos;re completing your Google login and sending you back to
              the app.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const nextPath = useMemo(
    () => getSafeNextPath(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      const authError =
        searchParams.get("error_description") ?? searchParams.get("error");
      if (authError) {
        if (!cancelled) setError(authError);
        return;
      }

      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          code,
        );

        if (cancelled) return;

        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
      }

      const storedNext =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem(GOOGLE_OAUTH_NEXT_KEY)
          : null;
      if (storedNext) {
        window.sessionStorage.removeItem(GOOGLE_OAUTH_NEXT_KEY);
      }

      router.replace(getSafeNextPath(storedNext ?? nextPath));
      router.refresh();
    }

    void finishSignIn();

    return () => {
      cancelled = true;
    };
  }, [nextPath, router, searchParams]);

  return <AuthCallbackCard error={error} onBackHome={() => router.replace("/")} />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackCard error={null} />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
