"use client";

export const GOOGLE_OAUTH_NEXT_KEY = "finbud-google-oauth-next";

export function getAppOrigin() {
  const explicitOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (explicitOrigin) {
    return explicitOrigin.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:8000";
}

export function getSafeNextPath(rawNext: string | null) {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return "/analyze";
  }

  return rawNext.startsWith("/auth/callback") ? "/analyze" : rawNext;
}
