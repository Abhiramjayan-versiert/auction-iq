"use client";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-surface-3 text-muted",
  accent: "bg-accent/15 text-accent",
  danger: "bg-danger/15 text-danger",
  warn: "bg-warn/15 text-warn",
  info: "bg-info/15 text-info",
  ok: "bg-ok/15 text-ok",
} as const;
export type Tone = keyof typeof tones;

export const Badge = ({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) => (
  <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>
);

export function Stat({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "accent" | "danger" | "warn"; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-line/60 bg-surface-2/60 p-3", className)}>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className={cn("tabular mt-1 text-lg font-semibold", tone === "accent" && "text-accent", tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Progress({ value, tone = "accent", className }: { value: number; tone?: "accent" | "danger" | "warn"; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full", tone === "accent" ? "bg-accent" : tone === "danger" ? "bg-danger" : "bg-warn")} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-lg border border-line/70 bg-surface p-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer", value === t.value ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div className={cn("w-full rounded-xl border border-line bg-surface shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-fg cursor-pointer" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export const Empty = ({ title, children, className }: { title: string; children?: ReactNode; className?: string }) => (
  <div className={cn("rounded-lg border border-dashed border-line p-6 text-center", className)}>
    <div className="text-sm font-medium">{title}</div>
    {children && <div className="mt-1 text-xs text-muted">{children}</div>}
  </div>
);

export const Spinner = ({ className }: { className?: string }) => (
  <div className={cn("h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent", className)} />
);

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
