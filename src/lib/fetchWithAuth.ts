import { supabase } from "./supabase";

/**
 * Wraps fetch() with an optional Authorization: Bearer header.
 * Phase-1 compatible: if no active session, sends request without token.
 * TODO(phase2-auth): throw an error here if no session to enforce auth.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, { ...options, headers });
}
