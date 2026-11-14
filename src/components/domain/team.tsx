import { cn } from "@/lib/utils";
import type { Team } from "@/lib/engine";

export function TeamChip({ team, className, showName = true }: { team: Pick<Team, "name" | "short_name" | "color" | "logo_url">; className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0", className)}>
      {team.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo_url} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
      ) : (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded text-[9px] font-bold text-black" style={{ background: team.color || "#a3e635" }}>
          {(team.short_name || team.name).slice(0, 3).toUpperCase()}
        </span>
      )}
      {showName && <span className="truncate">{team.short_name || team.name}</span>}
    </span>
  );
}

export function PlayerAvatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  const initials = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold text-muted" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}
