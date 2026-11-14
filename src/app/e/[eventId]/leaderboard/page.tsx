"use client";
import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { contestedPlayers, FORMULA_LABEL, fmtRating, type LeaderboardRow } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader, Tabs } from "@/components/ui/misc";
import { DataTable, type Column } from "@/components/ui/table";
import { SquadStatusBadge } from "@/components/domain/badges";
import { TeamChip } from "@/components/domain/team";
import { useMoney } from "@/components/participant/shared";
import { useEventData } from "@/hooks/useEventData";

type View = "official" | "analytical" | "efficiency" | "balance";

export default function Leaderboard() {
  const { analysis, myTeamId, rules, session, event } = useEventData();
  const m = useMoney();
  const [view, setView] = useState<View>("official");
  const completed = session?.status === "completed" || event?.status === "completed";
  const lb = analysis.leaderboard;
  const winner = completed ? lb.find((r) => r.officialRank === 1 && r.eligible) : null;
  const rankKey: Record<View, keyof LeaderboardRow> = { official: "officialRank", analytical: "analyticalRank", efficiency: "efficiencyRank", balance: "balanceRank" };
  const sorted = useMemo(() => [...lb].sort((a, b) => (a[rankKey[view]] as number) - (b[rankKey[view]] as number)), [lb, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = (r: LeaderboardRow) => analysis.byId[r.teamId];
  const hot = useMemo(() => contestedPlayers(analysis, 6), [analysis]);
  const cols: Column<LeaderboardRow>[] = [
    { key: "rank", header: "#", cell: (r) => <b>{r[rankKey[view]] as number}</b> },
    { key: "team", header: "Team", cell: (r) => <span className="flex items-center gap-2"><TeamChip team={t(r).team} />{r.teamId === myTeamId && <Badge tone="accent">You</Badge>}</span> },
    { key: "avg", header: "Avg rating", align: "right", cell: (r) => <b className={view === "official" ? "text-accent" : ""}>{fmtRating(t(r).rating.average)}</b> },
    { key: "tot", header: "Total", align: "right", cell: (r) => fmtRating(t(r).rating.total) },
    { key: "w", header: "Weighted", align: "right", cell: (r) => fmtRating(t(r).rating.weighted) },
    { key: "eff", header: "Rating / " + rules.currency, align: "right", cell: (r) => (r.efficiency === null ? "—" : r.efficiency.toFixed(2)) },
    { key: "bal", header: "Balance", align: "right", cell: (r) => t(r).rating.balance.toFixed(0) },
    { key: "bat", header: "Bat", align: "right", cell: (r) => fmtRating(t(r).rating.batting) },
    { key: "bowl", header: "Bowl", align: "right", cell: (r) => fmtRating(t(r).rating.bowling) },
    { key: "rem", header: "Purse", align: "right", cell: (r) => m(t(r).remaining) },
    { key: "comp", header: "Squad", align: "right", cell: (r) => `${t(r).rating.count}/${rules.squad_min}` },
    { key: "valid", header: "Validity", cell: (r) => <SquadStatusBadge status={t(r).rules.status} /> },
    { key: "proj", header: "Projected #", align: "right", cell: (r) => r.projectedRank },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Leaderboard" description={`Official ranking uses the competition's formula: ${FORMULA_LABEL[rules.ranking_formula]}${rules.require_complete_squad ? " · only complete, valid squads are eligible" : ""}.`} />
      {winner ? (
        <Card className="flex items-center gap-3 border-accent/50 p-4">
          <Trophy className="text-accent" />
          <div><div className="text-xs text-faint">Official winner (auction completed)</div><TeamChip team={t(winner).team} className="text-lg font-semibold" /></div>
        </Card>
      ) : (
        <p className="rounded-md border border-line bg-surface p-2 text-xs text-muted">Rankings are <b>provisional</b>. The official winner is declared only after the auction is completed and the configured rules are satisfied. “Projected #” is an analytical estimate.</p>
      )}
      <Tabs value={view} onChange={setView} tabs={[{ value: "official", label: "Official ranking" }, { value: "analytical", label: "Analytical strength" }, { value: "efficiency", label: "Purse efficiency" }, { value: "balance", label: "Squad balance" }]} />
      <Card>
        <DataTable rows={sorted} columns={cols} rowKey={(r) => r.teamId} rowClassName={(r) => (r.teamId === myTeamId ? "bg-accent/5" : !r.eligible && view === "official" ? "opacity-70" : undefined)} dense />
      </Card>
      {hot.length > 0 && (
        <Card>
          <CardHeader title="Players likely to attract competition" description="Available players that several teams both need and can afford." />
          <CardBody className="flex flex-wrap gap-2">
            {hot.map((h) => <Badge key={h.player.id} tone="warn">{h.player.name} ({fmtRating(h.player.overall)}) · {h.interestedTeams.length} teams</Badge>)}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
