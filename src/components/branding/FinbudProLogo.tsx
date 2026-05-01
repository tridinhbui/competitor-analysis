"use client";

import Image from "next/image";
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
        "relative inline-block shrink-0",
        isNav
          ? "h-8 w-[148px] sm:h-9 sm:w-[172px]"
          : "mx-auto h-14 w-[200px]",
        className
      )}
    >
      <Image
        src="/finbud-pro-logo.png"
        alt="Finbud Pro"
        title="Finbud Pro"
        fill
        className={cn("object-contain", isNav ? "object-left" : "object-center")}
        sizes={isNav ? "(max-width: 640px) 148px, 172px" : "200px"}
        priority={priority ?? isNav}
      />
    </span>
  );
}
