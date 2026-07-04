import { createClient, isAuthApiError } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;

function createMissingSupabaseClient(): never {
  throw new Error(
    "Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

const supabaseProjectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : "supabase";

export const SUPABASE_AUTH_STORAGE_KEY = `sb-${supabaseProjectRef}-auth-token`;

const SUPABASE_AUTH_STORAGE_KEYS = [
  SUPABASE_AUTH_STORAGE_KEY,
  `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`,
  `${SUPABASE_AUTH_STORAGE_KEY}-user`,
] as const;

function clearStorageKeys(storage: Storage) {
  for (const key of SUPABASE_AUTH_STORAGE_KEYS) {
    storage.removeItem(key);
  }
}

export function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;

  clearStorageKeys(window.localStorage);
  clearStorageKeys(window.sessionStorage);
}

export function isRecoverableSupabaseSessionError(error: unknown): boolean {
  return (
    isAuthApiError(error) &&
    /invalid refresh token|refresh token not found/i.test(error.message)
  );
}

export function recoverSupabaseSession(error: unknown): boolean {
  if (!isRecoverableSupabaseSessionError(error)) {
    return false;
  }

  clearSupabaseAuthStorage();
  return true;
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      })
    : new Proxy(
        {},
        {
          get() {
            return createMissingSupabaseClient;
          },
        }
      ) as ReturnType<typeof createClient>;
