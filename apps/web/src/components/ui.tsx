import { clsx } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return clsx(parts);
}

export function Card({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-line bg-paper shadow-[0_1px_0_rgba(22,20,16,0.04)]", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Modal({
  children,
  className,
  onBackdrop,
}: {
  children: ReactNode;
  className?: string;
  onBackdrop?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
      onClick={onBackdrop}
      role="presentation"
    >
      <div
        className={cn(
          "w-full max-w-lg space-y-4 rounded-2xl border border-line bg-paper p-6 shadow-xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "gold" | "danger";
}) {
  const styles = {
    primary: "bg-forest text-paper hover:bg-forest-deep",
    ghost: "bg-transparent text-ink border border-line hover:bg-paper-2",
    gold: "bg-gold text-paper hover:bg-gold-deep",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "ink",
}: {
  children: ReactNode;
  tone?: "ink" | "forest" | "gold" | "warn" | "danger";
}) {
  const map = {
    ink: "bg-paper-2 text-ink-soft",
    forest: "bg-forest/10 text-forest",
    gold: "bg-gold/25 text-gold-deep",
    warn: "bg-amber-100 text-warn",
    danger: "bg-red-50 text-danger",
  }[tone];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", map)}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="block space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
        {hint ? <span className="text-xs text-ink-soft">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-forest";
