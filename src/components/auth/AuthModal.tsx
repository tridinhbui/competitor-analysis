"use client";

import { useState } from "react";
import { X, Loader2, Mail, Lock } from "lucide-react";
import { FinbudProLogo } from "@/components/branding/FinbudProLogo";
import { useAuth } from "@/lib/authContext";
import { cn } from "@/lib/utils";

interface AuthModalProps {
  onClose: () => void;
}

type Mode = "signin" | "signup";

export function AuthModal({ onClose }: AuthModalProps) {
  const { signIn, signInWithGoogle, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const err =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password);

    setLoading(false);

    if (err) {
      setError(err);
    } else if (mode === "signup") {
      setSuccess("Account created! Check your email to confirm, then sign in.");
      setMode("signin");
    } else {
      onClose();
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    const err = await signInWithGoogle();
    if (err) {
      setError(err);
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl sm:p-7">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex justify-center pr-6">
          <FinbudProLogo variant="modal" priority={false} />
        </div>

        <h2 className="pr-8 text-lg font-semibold tracking-tight text-slate-900">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          {mode === "signin"
            ? "Your history stays with your account."
            : "Your analyses will be saved."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                <path
                  d="M22.5 12.233c0-.78-.07-1.53-.2-2.25H12v4.26h5.89a5.04 5.04 0 0 1-2.18 3.31v2.74h3.52c2.06-1.9 3.28-4.7 3.28-8.06Z"
                  fill="#4285F4"
                />
                <path
                  d="M12 22.5c2.97 0 5.46-.98 7.28-2.66l-3.52-2.74c-.98.66-2.23 1.06-3.76 1.06-2.89 0-5.34-1.95-6.22-4.57H2.13v2.83A10.5 10.5 0 0 0 12 22.5Z"
                  fill="#34A853"
                />
                <path
                  d="M5.78 13.59A6.3 6.3 0 0 1 5.43 12c0-.55.1-1.08.28-1.59V7.58H2.13A10.5 10.5 0 0 0 1.5 12c0 1.68.4 3.26 1.11 4.42l3.17-2.83Z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.84c1.62 0 3.08.56 4.23 1.64l3.17-3.17C17.45 2.5 14.97 1.5 12 1.5A10.5 10.5 0 0 0 2.13 7.58l3.58 2.83C6.6 7.79 9.08 5.84 12 5.84Z"
                  fill="#EA4335"
                />
              </svg>
            )}
            {loading ? "Connecting..." : "Continue with Google"}
          </button>

          <div className="relative py-0.5 text-center">
            <span className="absolute inset-x-0 top-1/2 -z-10 h-px -translate-y-1/2 bg-slate-200/90" />
            <span className="bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              or
            </span>
          </div>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
          )}
          {success && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-slate-500">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                onClick={() => { setMode("signup"); setError(null); setSuccess(null); }}
                className={cn("font-semibold text-primary underline-offset-2 transition hover:underline")}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => { setMode("signin"); setError(null); setSuccess(null); }}
                className={cn("font-semibold text-primary hover:underline")}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
