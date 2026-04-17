"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";

function OverviewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/analyze?tab=snapshot");
  }, [router]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-muted-foreground">
      Opening snapshot…
    </div>
  );
}

export default function OverviewPage() {
  return (
    <RequireAuth>
      <OverviewRedirect />
    </RequireAuth>
  );
}
