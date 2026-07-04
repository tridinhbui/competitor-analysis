"use client";

import { cn } from "@/lib/utils";

type Variant = "nav" | "modal";

interface Props {
  variant?: Variant;
  className?: string;
  /** When true, skip priority (e.g. modal). */
  priority?: boolean;
}

export function FinbudProLogo({
  variant = "nav",
  className,
  priority,
}: Props) {
  const isNav = variant === "nav";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-border/70 bg-white px-3 text-center font-sans font-semibold tracking-[0.16em] text-foreground shadow-sm",
        isNav ? "h-8 min-w-[132px] text-[11px] sm:h-9 sm:min-w-[148px]" : "mx-auto h-14 min-w-[176px] text-xs",
        className
      )}
    >
      <span className="truncate">Strategy Hub</span>
    </span>
  );
}
