"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell, type NavGroup } from "@/components/shell/AppShell";
import { Badge, Spinner } from "@/components/ui/misc";
import { EventDataProvider, useEventData } from "@/hooks/useEventData";

export function ManageShell({ eventId, user, isAdmin, children }: { eventId: string; user: { name: string; email: string; role: string }; isAdmin: boolean; children: ReactNode }) {
  const b = `/manage/${eventId}`;
  const nav: NavGroup[] = [
    {
      items: [
        { href: b, label: "Event overview", icon: "dashboard", exact: true },
        { href: `${b}/control-room`, label: "Auction control room", icon: "gavel" },
        { href: `${b}/transactions`, label: "Transactions & logs", icon: "transactions" },
      ],
    },
    {
      title: "Setup",
      items: [
        { href: `${b}/teams`, label: "Teams", icon: "team" },
        { href: `${b}/players`, label: "Players", icon: "players" },
        { href: `${b}/rules`, label: "Auction rules", icon: "rules" },
        { href: `${b}/members`, label: "Participants", icon: "members" },
      ],
    },
    { title: "Output", items: [{ href: `${b}/reports`, label: "Event reports", icon: "reports" }, { href: `/e/${eventId}`, label: "Participant view", icon: "intel" }] },
    { items: [{ href: "/manage", label: "All assigned events", icon: "events" }, ...(isAdmin ? [{ href: "/admin", label: "Super Admin", icon: "gauge" as const }] : [])] },
  ];
  return (
    <EventDataProvider eventId={eventId}>
      <NavSwitch nav={nav} eventId={eventId} user={user}>{children}</NavSwitch>
    </EventDataProvider>
  );
}

/** Trackers get a slimmer data-entry menu that links back to the crew's analytics. */
function NavSwitch({ nav, eventId, user, children }: { nav: NavGroup[]; eventId: string; user: { name: string; email: string; role: string }; children: ReactNode }) {
  const { isTracker } = useEventData();
  const b = `/manage/${eventId}`;
  const trackerNav: NavGroup[] = [
    {
      title: "Data entry",
      items: [
        { href: `${b}/control-room`, label: "Record results", icon: "gavel" },
        { href: `${b}/players`, label: "Players", icon: "players" },
        { href: `${b}/teams`, label: "Teams", icon: "team" },
        { href: `${b}/rules`, label: "Rules", icon: "rules" },
        { href: `${b}/transactions`, label: "Entry history", icon: "transactions" },
      ],
    },
    { title: "Insights", items: [{ href: `/e/${eventId}`, label: "Dashboard", icon: "dashboard" }, { href: `/e/${eventId}/live`, label: "Live workspace", icon: "live" }, { href: `/e/${eventId}/crew`, label: "Crew & roles", icon: "members" }] },
    { items: [{ href: "/dashboard", label: "All my auctions", icon: "events" }] },
  ];
  return (
    <AppShell nav={isTracker ? trackerNav : nav} user={user} eventId={eventId} header={<Header />}>
      <Gate>{children}</Gate>
    </AppShell>
  );
}

function Header() {
  const { event, session, connected, isTracker } = useEventData();
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Badge tone="info">{isTracker ? "Data entry" : "Auctioneer"}</Badge>
      <span className="truncate text-sm font-semibold">{event?.name ?? "…"}</span>
      {session && <Badge tone={session.status === "live" ? "accent" : session.status === "paused" ? "warn" : "neutral"}>{session.status.replace("_", " ")}</Badge>}
      <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] ${connected ? "text-ok" : "text-warn"}`}><span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-ok" : "bg-warn animate-pulse"}`} />{connected ? "Realtime" : "Reconnecting"}</span>
      {event && <span className="ml-auto hidden font-mono text-xs text-muted md:inline">{isTracker ? "Crew code" : "Code"} {event.invite_code}</span>}
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { loading, error, event, canManage } = useEventData();
  if (loading) return <div className="grid h-64 place-items-center"><Spinner className="h-6 w-6" /></div>;
  if (error || !event || !canManage)
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-danger">{error ?? "You are not authorised to manage this event."}</p>
        <Link href="/manage" className="mt-3 inline-block text-xs text-accent">Back</Link>
      </div>
    );
  return <>{children}</>;
}
