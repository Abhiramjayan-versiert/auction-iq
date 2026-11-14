import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl border border-line/70 bg-surface", className)} {...p} />
);
export const CardHeader = ({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) => (
  <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-2", className)}>
    <div className="min-w-0">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
    </div>
    {action}
  </div>
);
export const CardBody = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn("px-4 pb-4", className)} {...p} />;
