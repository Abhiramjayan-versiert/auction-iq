"use client";
import Link from "next/link";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney, fmtRating } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader, Stat } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { TeamChip } from "@/components/domain/team";
import { useEventData } from "@/hooks/useEventData";

export default function Overview() {
  const { event, teams, players, transactions, analysis, rules, teamMembers, session } = useEventData();
  const m = (n: number | null) => fmtMoney(n, rules.currency);
  const sold = players.filter((p) => p.auction_status === "sold");
  const spent = sold.reduce((a, p) => a + Number(p.sold_price ?? 0), 0);
  const unrated = players.filter((p) => p.overall === null).length;
  const checklist = [
    { ok: teams.length > 1, label: `Teams created (${teams.length})`, href: "teams" },
    { ok: players.length > 0, label: `Players added (${players.length})`, href: "players" },
    { ok: unrated === 0 && players.length > 0, label: unrated ? `${unrated} players have no rating` : "All players rated", href: "players" },
    { ok: rules.constraints.length > 0, label: `Rules configured (${rules.constraints.length} constraints, squad ${rules.squad_min}–${rules.squad_max})`, href: "rules" },
    { ok: teamMembers.length > 0, label: `Teams with owners (${new Set(teamMembers.map((t) => t.team_id)).size}/${teams.length})`, href: "members" },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title={event!.name} description={event!.description ?? undefined} actions={<Link href={`/manage/${event!.id}/control-room`} className={buttonVariants({})}>Open control room</Link>} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Stat label="Session" value={session?.status.replace("_", " ") ?? "—"} />
        <Stat label="Teams" value={teams.length} />
        <Stat label="Players" value={players.length} />
        <Stat label="Sold" value={`${sold.length}`} sub={`${players.filter((p) => p.auction_status === "unsold").length} unsold`} />
        <Stat label="Total spent" value={m(spent)} />
        <Stat label="Transactions" value={transactions.filter((t) => t.status === "active").length} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Invite participants" />
          <CardBody>
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xl tracking-widest">{event!.invite_code}</span>
              <button className="text-muted hover:text-fg cursor-pointer" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/join?code=${event!.invite_code}`); toast.success("Join link copied"); }} aria-label="Copy link"><Copy size={16} /></button>
            </div>
            <p className="mt-2 text-xs text-muted">Share the code or the join link. {event!.requires_approval ? "Join requests need your approval." : "Participants get instant access."} {event!.team_selection === "self_select" ? "Participants pick their own team." : "You assign teams."}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Readiness checklist" />
          <CardBody className="space-y-1.5">
            {checklist.map((c) => (
              <Link key={c.label} href={`/manage/${event!.id}/${c.href}`} className="flex items-center justify-between text-sm hover:text-accent">
                <span>{c.label}</span><Badge tone={c.ok ? "ok" : "warn"}>{c.ok ? "done" : "todo"}</Badge>
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Standings (official formula)" />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="text-left text-[11px] uppercase text-faint"><th>#</th><th>Team</th><th className="text-right">Players</th><th className="text-right">Spent</th><th className="text-right">Remaining</th><th className="text-right">Avg</th><th>Status</th></tr></thead>
            <tbody>{analysis.leaderboard.map((r) => {
              const t = analysis.byId[r.teamId];
              return <tr key={r.teamId} className="border-t border-line/40"><td className="py-1.5">{r.officialRank}</td><td><TeamChip team={t.team} /></td><td className="text-right">{t.rating.count}</td><td className="text-right">{m(t.spent)}</td><td className="text-right">{m(t.remaining)}</td><td className="text-right font-semibold">{fmtRating(t.rating.average)}</td><td><Badge tone={t.rules.status === "valid" ? "ok" : t.rules.status === "incomplete" ? "warn" : "danger"}>{t.rules.status}</Badge></td></tr>;
            })}</tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
