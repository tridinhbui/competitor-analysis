"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { recoverSupabaseSession, supabase } from "./supabase";
import { getAppOrigin, GOOGLE_OAUTH_NEXT_KEY } from "./authRedirect";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Always returns the current access_token or null */
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    async function initializeAuth() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;

        if (error) {
          recoverSupabaseSession(error);
          applySession(null);
        } else {
          applySession(data.session);
        }

        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          applySession(nextSession);
        });

        unsubscribe = () => listener.subscription.unsubscribe();
      } catch {
        if (!active) return;
        applySession(null);
      }

      if (active) {
        setLoading(false);
      } else {
        unsubscribe?.();
      }
    }

    void initializeAuth();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = new URL("/auth/callback", getAppOrigin());
    const nextPath = "/analyze?tab=extract";

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(GOOGLE_OAUTH_NEXT_KEY, nextPath);
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      return error.message;
    }

    if (!data?.url) {
      return "Google sign-in could not start. Please try again.";
    }

    window.location.assign(data.url);
    return null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error && !recoverSupabaseSession(error)) return;
    applySession(null);
  }, [applySession]);

  const getAccessToken = useCallback(() => session?.access_token ?? null, [session]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signInWithGoogle, signUp, signOut, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
