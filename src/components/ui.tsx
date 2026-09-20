"use client";

import { StockStatus, STATUS_LABEL } from "@/lib/types";

const STATUS_STYLES: Record<StockStatus, string> = {
  in_stock: "bg-ok-50 text-ok-600 border-ok-500/25",
  none: "bg-steel-50 text-muted border-line-strong",
  low: "bg-warn-50 text-warn-600 border-warn-500/35",
  reorder: "bg-alert-50 text-alert-600 border-alert-500/30",
  out_of_stock: "bg-danger-50 text-danger-600 border-danger-500/25",
};

/** Fill tier — for meters and marks, where the label sits outside the swatch. */
export const STATUS_FILL: Record<StockStatus, string> = {
  in_stock: "bg-ok-500",
  none: "bg-steel-200",
  low: "bg-warn-500",
  reorder: "bg-alert-500",
  out_of_stock: "bg-danger-500",
};

export function StatusBadge({ status }: { status: StockStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ItemId({ id, className = "" }: { id: string; className?: string }) {
  return (
    <span className={`num rounded bg-steel-50 px-1.5 py-0.5 text-[11px] text-steel-600 ${className}`}>
      {id}
    </span>
  );
}

export function TypeBadge({ type }: { type: "in" | "out" | "adjust" | "condition" }) {
  const map = {
    in: { label: "In", cls: "bg-ok-50 text-ok-600 border-ok-600/20" },
    out: { label: "Out", cls: "bg-rust-50 text-rust-600 border-rust-600/25" },
    adjust: { label: "Adjust", cls: "bg-steel-50 text-steel-600 border-steel-400/25" },
    condition: { label: "Damage / loss", cls: "bg-danger-50 text-danger-600 border-danger-500/25" },
  }[type];
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold ${map.cls}`}>
      {map.label}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`elevated rounded-xl border border-line bg-card ${className}`}>{children}</div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-12 text-center text-sm text-muted">{children}</div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-steel-200 border-t-steel-500" />
      {label}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-steel-600 text-on-primary hover:bg-steel-700 disabled:bg-steel-200 disabled:text-muted",
    secondary: "border border-line-strong bg-card text-ink hover:bg-steel-50 disabled:text-muted",
    ghost: "text-steel-600 hover:bg-steel-50",
    danger: "border border-danger-600/30 bg-danger-50 text-danger-600 hover:bg-danger-600 hover:text-white",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-steel-600 bg-steel-600 text-on-primary"
          : "border-line-strong bg-card text-muted hover:border-steel-400 hover:text-steel-600"
      }`}
    >
      {children}
    </button>
  );
}

export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
