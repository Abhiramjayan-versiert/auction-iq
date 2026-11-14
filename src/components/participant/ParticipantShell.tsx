"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell, type NavGroup } from "@/components/shell/AppShell";
import { InstallButton } from "@/components/shell/InstallButton";
import { TeamChip } from "@/components/domain/team";
import { Select } from "@/components/ui/form";
import { Badge, Spinner } from "@/components/ui/misc";
import { EventDataProvider, useEventData } from "@/hooks/useEventData";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { AlertsWatcher } from "./AlertsWatcher";

type User = { name: string; email: string; role: string };

export function ParticipantShell({ eventId, user, children }: { eventId: string; user: User; children: ReactNode }) {
  const key = `aiq-perspective-${eventId}`;
  const [perspective, setPerspective] = useState<string | null>(null);
  useEffect(() => {
    try {
      setPerspective(sessionStorage.getItem(key));
    } catch {}
  }, [key]);
  const choose = (id: string) => {
    setPerspective(id || null);
    try {
      sessionStorage.setItem(key, id);
    } catch {}
  };
  return (
    <EventDataProvider eventId={eventId} perspectiveTeamId={perspective}>
      <WorkspaceProvider>
        <AlertsWatcher />
        <Inner eventId={eventId} user={user} perspective={perspective} onPerspective={choose}>
          {children}
        </Inner>
      </WorkspaceProvider>
    </EventDataProvider>
  );
}

function Inner({ eventId, user, perspective, onPerspective, children }: { eventId: string; user: User; perspective: string | null; onPerspective: (id: string) => void; children: ReactNode }) {
  const { canManage, isTracker } = useEventData();
  const b = `/e/${eventId}`;
  const nav: NavGroup[] = [
    {
      items: [
        { href: b, label: "Dashboard", icon: "dashboard", exact: true },
        { href: `${b}/live`, label: "Live workspace", icon: "live" },
        { href: `${b}/team`, label: "My Team", icon: "team" },
      ],
    },
  ];
  if (canManage) {
    nav.push({
      title: isTracker ? "Data entry" : "Auctioneer",
      items: [
        { href: `/manage/${eventId}/control-room`, label: isTracker ? "Record results" : "Control room", icon: "gavel" },
        { href: `/manage/${eventId}/players`, label: "Players", icon: "players" },
        { href: `/manage/${eventId}/teams`, label: "Teams", icon: "team" },
        { href: `/manage/${eventId}/rules`, label: "Rules", icon: "rules" },
      ],
    });
  }
  nav.push(
    {
      title: "Intelligence",
      items: [
        { href: `${b}/competitors`, label: "Competitors", icon: "intel" },
        { href: `${b}/compare`, label: "Team comparison", icon: "compare" },
        { href: `${b}/leaderboard`, label: "Leaderboard", icon: "leaderboard" },
        { href: `${b}/players`, label: "Player explorer", icon: "players" },
      ],
    },
    {
      title: "Decision tools",
      items: [
        { href: `${b}/smart-bid`, label: "Smart Bid", icon: "smartbid" },
        { href: `${b}/purse-planner`, label: "Purse planner", icon: "purse" },
        { href: `${b}/simulator`, label: "What-if simulator", icon: "simulator" },
      ],
    },
    {
      title: isTracker ? "Crew & private" : "Private",
      items: [
        ...(isTracker ? [{ href: `${b}/crew`, label: "Crew & roles", icon: "members" as const }] : []),
        { href: `${b}/shortlist`, label: "Shortlist", icon: "shortlist" },
        { href: `${b}/notes`, label: "My notes", icon: "notes" },
        { href: `${b}/alerts`, label: "Alerts", icon: "alerts" },
        { href: `${b}/reports`, label: "Reports & Excel", icon: "reports" },
      ],
    },
    { items: [{ href: "/dashboard", label: "All my auctions", icon: "events" }] },
  );
  return (
    <AppShell nav={nav} user={user} eventId={eventId} header={<Header onPerspective={onPerspective} perspective={perspective} />}>
      <Gate>{children}</Gate>
    </AppShell>
  );
}

function Header({ onPerspective, perspective }: { onPerspective: (id: string) => void; perspective: string | null }) {
  const { event, session, connected, myTeamId, teams, teamMembers, userId, isTracker, canManage } = useEventData();
  const own = teamMembers.some((m) => m.user_id === userId);
  const team = teams.find((t) => t.id === myTeamId);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="truncate text-sm font-semibold">{event?.name ?? "…"}</span>
      {isTracker ? (
        <Badge tone={canManage ? "accent" : "info"}>{canManage ? "Data entry" : "Analyst · live view"}</Badge>
      ) : (
        session && <Badge tone={session.status === "live" ? "accent" : session.status === "paused" ? "warn" : "neutral"}>{session.status.replace("_", " ")}</Badge>
      )}
      <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] ${connected ? "text-ok" : "text-warn"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-ok" : "bg-warn animate-pulse"}`} />
        {connected ? "Live" : "Reconnecting"}
      </span>
      <span className="ml-auto hidden items-center gap-2 md:flex">
        <InstallButton compact />
        {!own ? (
          <Select className="h-8 w-48 text-xs" value={perspective ?? ""} onChange={(e) => onPerspective(e.target.value)} aria-label="View as team">
            <option value="">View as team…</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        ) : team ? (
          <TeamChip team={team} className="text-sm" />
        ) : null}
      </span>
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { loading, error, event } = useEventData();
  if (loading) return <div className="grid h-64 place-items-center"><Spinner className="h-6 w-6" /></div>;
  if (error || !event)
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-danger">{error ?? "Event not available."}</p>
        <Link href="/dashboard" className="mt-3 inline-block text-xs text-accent">Back to my auctions</Link>
      </div>
    );
  return <>{children}</>;
}
