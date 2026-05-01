import { cn } from "@/lib/utils";

type StatusVariant =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

type StatusSize = "xs" | "sm";

const variantClasses: Record<StatusVariant, string> = {
  primary: "bg-primary/10 text-primary ring-primary/20",
  success: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-100 text-amber-700 ring-amber-200",
  danger: "bg-red-100 text-red-700 ring-red-200",
  info: "bg-sky-100 text-sky-700 ring-sky-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

const sizeClasses: Record<StatusSize, string> = {
  xs: "px-1.5 py-0.5 text-[9px]",
  sm: "px-2 py-0.5 text-[10px]",
};

interface StatusPillProps {
  variant?: StatusVariant;
  size?: StatusSize;
  uppercase?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Unified status pill. Use `variant` for semantic meaning:
 * - primary: featured / lead (brand accent)
 * - success: ready / on file (green)
 * - warning: risk / low confidence (amber)
 * - danger: alert / error (red)
 * - info: signal / informational (blue)
 * - neutral: empty / default state (slate)
 */
export function StatusPill({
  variant = "neutral",
  size = "sm",
  uppercase = false,
  className,
  children,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold ring-1 ring-inset whitespace-nowrap",
        variantClasses[variant],
        sizeClasses[size],
        uppercase && "uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}
