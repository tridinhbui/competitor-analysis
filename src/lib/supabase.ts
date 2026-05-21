import { createClient, isAuthApiError } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseProjectRef = new URL(supabaseUrl).hostname.split(".")[0];

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
