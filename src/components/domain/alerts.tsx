import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { Alert } from "@/lib/engine";
import { cn } from "@/lib/utils";

const style = {
  critical: { cls: "border-danger/50 bg-danger/10 text-danger", label: "CRITICAL", Icon: AlertOctagon },
  red: { cls: "border-danger/40 bg-danger/5 text-danger", label: "RED", Icon: AlertTriangle },
  yellow: { cls: "border-warn/40 bg-warn/5 text-warn", label: "YELLOW", Icon: AlertTriangle },
  info: { cls: "border-line bg-surface-2 text-muted", label: "INFO", Icon: Info },
};

export function RuleAlerts({ alerts, compact, hideInfo }: { alerts: Alert[]; compact?: boolean; hideInfo?: boolean }) {
  const list = hideInfo ? alerts.filter((a) => a.level !== "info") : alerts;
  if (!list.length)
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <CheckCircle2 size={14} className="text-ok" /> No rule issues.
      </div>
    );
  return (
    <ul className="space-y-1.5">
      {list.map((a, i) => {
        const s = a.kind === "valid" ? { ...style.info, cls: "border-ok/40 bg-ok/5 text-ok", Icon: CheckCircle2, label: "VALID" } : style[a.level];
        return (
          <li key={i} className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs", s.cls)}>
            <s.Icon size={14} className="mt-0.5 shrink-0" />
            <span>
              {!compact && <b className="mr-1">{s.label} ·</b>}
              {a.kind === "future" && a.level !== "info" && <span className="mr-1 opacity-80">[Potential]</span>}
              <span className="text-fg/90">{a.message}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
