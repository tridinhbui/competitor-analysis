"use client";

import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

/** Standard chart frame: fixed height + full-width responsive container. */
export function ChartFrame({ heightClassName, children }: { heightClassName?: string; children: ReactNode }) {
  return (
    <div className={heightClassName ?? "h-52"}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
