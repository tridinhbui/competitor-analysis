import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export type AuthedUser = {
  userId: string;
  email: string | null;
  token: string;
};

export function createAuthedSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

export async function requireAuthedUser(
  req: Request,
): Promise<AuthedUser | NextResponse> {
  const authHeader = req.headers.get("authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized. Please sign in again." }, { status: 401 });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized. Please sign in again." }, { status: 401 });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) {
    return NextResponse.json({ error: "Unauthorized. Please sign in again." }, { status: 401 });
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    token,
  };
}

export async function requireAdminUser(
  req: Request,
): Promise<AuthedUser | NextResponse> {
  const result = await requireAuthedUser(req);
  if (result instanceof NextResponse) return result;

  const { data } = await supabase.auth.getUser(result.token);
  const user = data.user;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const metadataRole =
    user?.app_metadata?.role === "admin" || user?.user_metadata?.role === "admin";
  const emailAllowed = result.email ? adminEmails.includes(result.email.toLowerCase()) : false;

  if (!metadataRole && !emailAllowed) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return result;
}
