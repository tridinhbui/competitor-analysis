"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

function UpdatePasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingSession, setLoadingSession] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      const code = searchParams.get("code");
      if (!code) {
        setLoadingSession(false);
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;

      if (exchangeError) {
        setError(exchangeError.message);
      }
      setLoadingSession(false);
    }

    void prepareRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    window.setTimeout(() => router.replace("/analyze?tab=extract"), 900);
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#fffaf6] px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl border border-[#e7c7b7]/70 bg-white p-7 shadow-xl"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#cc521d]">
          Account recovery
        </p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
          Set a new password
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Choose a new password for your finance workspace. After saving, we will send you back to Analyze.
        </p>

        {loadingSession ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying reset link...
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <div>
              <label htmlFor="new-password" className="text-xs font-semibold text-slate-600">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-sm outline-none transition focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="text-xs font-semibold text-slate-600">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-sm outline-none transition focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>
        )}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            Password updated. Opening your workspace...
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loadingSession || saving}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving..." : "Update password"}
        </button>
      </form>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordContent />
    </Suspense>
  );
}
