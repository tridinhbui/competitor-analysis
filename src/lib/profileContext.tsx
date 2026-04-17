"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./authContext";
import { supabase } from "./supabase";

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  provider: string;
  role: "analyst" | "investor" | "founder" | "student" | null;
  language: "vi" | "en";
  timezone: string | null;
  default_analysis_depth: "quick" | "standard" | "deep";
  default_output_style: "bullet" | "executive" | "report";
  favorite_modules: string[];
  created_at: string;
  updated_at: string;
}

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  /** true when role or language is unset — prompt onboarding */
  needsOnboarding: boolean;
  upsertProfile: (data: Partial<Omit<UserProfile, "id" | "created_at" | "updated_at">>) => Promise<string | null>;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

function isOnboardingRequired(p: UserProfile | null): boolean {
  if (!p) return false;
  return !p.role;
}

function coerceMeta(u: Record<string, unknown> | undefined, key: string): string | null {
  const v = u?.[key];
  return typeof v === "string" ? v : null;
}

function normalizeProfile(data: Record<string, unknown>): UserProfile {
  return {
    id: String(data.id ?? ""),
    email: typeof data.email === "string" ? data.email : null,
    full_name: typeof data.full_name === "string" ? data.full_name : null,
    avatar_url: typeof data.avatar_url === "string" ? data.avatar_url : null,
    provider: typeof data.provider === "string" ? data.provider : "email",
    role:
      data.role === "analyst" || data.role === "investor" || data.role === "founder" || data.role === "student"
        ? data.role
        : null,
    timezone: typeof data.timezone === "string" ? data.timezone : null,
    created_at: typeof data.created_at === "string" ? data.created_at : new Date(0).toISOString(),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : new Date().toISOString(),
    favorite_modules: Array.isArray(data.favorite_modules)
      ? (data.favorite_modules as string[])
      : [],
    language: (data.language as UserProfile["language"]) ?? "en",
    default_analysis_depth: (data.default_analysis_depth as UserProfile["default_analysis_depth"]) ?? "standard",
    default_output_style: (data.default_output_style as UserProfile["default_output_style"]) ?? "bullet",
  };
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const appMeta = user.app_metadata as Record<string, unknown> | undefined;
    const seed = {
      id: user.id,
      email: user.email ?? null,
      full_name: coerceMeta(meta, "full_name") ?? coerceMeta(meta, "name"),
      avatar_url: coerceMeta(meta, "avatar_url") ?? coerceMeta(meta, "picture"),
      provider: (typeof appMeta?.provider === "string" ? appMeta.provider : null) ?? "email",
      updated_at: new Date().toISOString(),
    };

    if (data) {
      const shouldSyncBasic =
        data.email !== seed.email ||
        data.full_name !== seed.full_name ||
        data.avatar_url !== seed.avatar_url ||
        data.provider !== seed.provider;

      if (shouldSyncBasic) {
        const { data: synced } = await supabase
          .from("profiles")
          .upsert({ ...data, ...seed }, { onConflict: "id" })
          .select("*")
          .maybeSingle();
        setProfile(synced ? normalizeProfile(synced) : normalizeProfile(data));
      } else {
        setProfile(normalizeProfile(data));
      }
    } else {
      // No profile row yet — auto-create from OAuth/email metadata
      const { data: created } = await supabase
        .from("profiles")
        .upsert(seed, { onConflict: "id" })
        .select("*")
        .maybeSingle();
      setProfile(created ? normalizeProfile(created) : null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const upsertProfile = useCallback(
    async (updates: Partial<Omit<UserProfile, "id" | "created_at" | "updated_at">>) => {
      if (!user) return "Not authenticated";

      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const appMeta = user.app_metadata as Record<string, unknown> | undefined;

      const base = {
        id: user.id,
        email: user.email ?? null,
        full_name: coerceMeta(meta, "full_name") ?? coerceMeta(meta, "name"),
        avatar_url: coerceMeta(meta, "avatar_url") ?? coerceMeta(meta, "picture"),
        provider: (typeof appMeta?.provider === "string" ? appMeta.provider : null) ?? "email",
      };

      const payload = {
        ...base,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (error) return error.message;
      await load();
      return null;
    },
    [user, load],
  );

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        needsOnboarding: isOnboardingRequired(profile),
        upsertProfile,
        refresh: load,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside <ProfileProvider>");
  return ctx;
}
