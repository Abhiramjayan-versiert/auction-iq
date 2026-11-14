"use client";
import { ChevronDown, Lightbulb, ShieldAlert, Swords, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { Insight } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./badges";

const icon = { critical: ShieldAlert, warning: TriangleAlert, opportunity: Swords, info: Lightbulb };
const tone = { critical: "text-danger", warning: "text-warn", opportunity: "text-accent", info: "text-info" };

export function InsightCard({ insight, defaultOpen }: { insight: Insight; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = icon[insight.severity];
  return (
    <div className="rounded-lg border border-line/70 bg-surface-2/50">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-2.5 p-3 text-left cursor-pointer">
        <Icon size={16} className={cn("mt-0.5 shrink-0", tone[insight.severity])} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{insight.title}</div>
          <div className="mt-0.5 text-xs text-muted">{insight.detected}</div>
        </div>
        <ChevronDown size={14} className={cn("mt-1 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <dl className="grid gap-2 border-t border-line/60 px-3 py-2.5 text-xs sm:grid-cols-2">
          <div><dt className="text-faint">Why it matters</dt><dd>{insight.why}</dd></div>
          <div><dt className="text-faint">Suggested action</dt><dd className="text-accent">{insight.action}</dd></div>
          <div><dt className="text-faint">Expected impact</dt><dd>{insight.impact}</dd></div>
          <div><dt className="text-faint">Supporting calculation</dt><dd className="font-mono text-[11px] text-muted">{insight.calculation}</dd></div>
          <div className="sm:col-span-2"><ConfidenceBadge c={insight.confidence} /></div>
        </dl>
      )}
    </div>
  );
}
