"use client";
import { Download, Printer, Trophy } from "lucide-react";
import { fmtMoney, fmtPct, fmtRating, FORMULA_LABEL } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TeamChip } from "@/components/domain/team";
import { useEventData } from "@/hooks/useEventData";
import { downloadCsv } from "@/lib/utils";
import { analyticsWorkbook, downloadWorkbook } from "@/lib/data/excel";

export default function EventReports() {
  const { event, analysis, rules, players, session, teamName, transactions } = useEventData();
  const m = (n: number | null | undefined) => fmtMoney(n, rules.currency);
  const completed = session?.status === "completed";
  const winner = completed ? analysis.leaderboard.find((r) => r.officialRank === 1 && r.eligible) : null;
  const sold = players.filter((p) => p.auction_status === "sold").sort((a, b) => Number(b.sold_price) - Number(a.sold_price));
  const exportStandings = () => downloadCsv(`${event!.name}-final-standings.csv`, analysis.leaderboard.map((r) => {
    const t = analysis.byId[r.teamId];
    return { rank: r.officialRank, team: t.team.name, eligible: r.eligible ? "yes" : "no", official_value: r.officialValue, average: t.rating.average, total: t.rating.total, weighted: t.rating.weighted, players: t.rating.count, spent: t.spent, remaining: t.remaining, status: t.rules.status };
  }));
  const exportRosters = () => downloadCsv(`${event!.name}-rosters.csv`, analysis.teams.flatMap((t) => t.entries.map((e) => ({ team: t.team.name, player: e.player.name, origin: e.player.origin, category: e.player.category, rating: e.player.overall, price: e.price }))));
  return (
    <div className="space-y-4">
      <PageHeader title="Event reports" description={`Official formula: ${FORMULA_LABEL[rules.ranking_formula]}`} actions={<><Button variant="secondary" size="sm" onClick={() => downloadWorkbook(`${event!.name} - results.xlsx`, analyticsWorkbook(analysis, players, teamName, transactions))}><Download size={14} /> Excel workbook</Button><Button variant="outline" size="sm" onClick={exportStandings}><Download size={14} /> Standings CSV</Button><Button variant="outline" size="sm" onClick={exportRosters}><Download size={14} /> Rosters CSV</Button><Button size="sm" onClick={() => window.print()}><Printer size={14} /> Print / PDF</Button></>} />
      {winner ? (
        <Card className="flex items-center gap-3 border-accent/50 p-4"><Trophy className="text-accent" /><div><div className="text-xs text-faint">Official winner</div><TeamChip team={analysis.byId[winner.teamId].team} className="text-lg font-semibold" /> <span className="ml-2 tabular text-accent">{fmtRating(winner.officialValue)}</span></div></Card>
      ) : <p className="text-xs text-muted">{completed ? "Auction completed, but no team satisfies the winning conditions." : "Provisional — complete the auction in the control room to declare the official winner."}</p>}
      <Card>
        <CardHeader title="Final standings" />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="text-left text-[11px] uppercase text-faint"><th>#</th><th>Team</th><th className="text-right">Official</th><th className="text-right">Avg</th><th className="text-right">Total</th><th className="text-right">Players</th><th className="text-right">Spent</th><th className="text-right">Left</th><th className="text-right">Used</th><th>Eligibility</th></tr></thead>
            <tbody>{analysis.leaderboard.map((r) => { const t = analysis.byId[r.teamId]; return (
              <tr key={r.teamId} className="border-t border-line/40"><td className="py-1.5">{r.officialRank}</td><td><TeamChip team={t.team} /></td><td className="text-right font-semibold">{fmtRating(r.officialValue)}</td><td className="text-right">{fmtRating(t.rating.average)}</td><td className="text-right">{fmtRating(t.rating.total)}</td><td className="text-right">{t.rating.count}</td><td className="text-right">{m(t.spent)}</td><td className="text-right">{m(t.remaining)}</td><td className="text-right">{fmtPct(t.utilization)}</td><td><Badge tone={r.eligible ? "ok" : "warn"}>{r.eligible ? "eligible" : t.rules.status}</Badge></td></tr>
            ); })}</tbody>
          </table>
        </CardBody>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top purchases" />
          <CardBody><ol className="space-y-1 text-sm">{sold.slice(0, 15).map((p) => <li key={p.id} className="flex justify-between"><span>{p.name} <span className="text-xs text-faint">{fmtRating(p.overall)}</span></span><span className="tabular">{m(p.sold_price)} · {teamName(p.sold_team_id)}</span></li>)}</ol></CardBody>
        </Card>
        <Card>
          <CardHeader title="Auction summary" />
          <CardBody className="space-y-1 text-sm">
            {[["Players sold", sold.length], ["Unsold", players.filter((p) => p.auction_status === "unsold").length], ["Not auctioned", players.filter((p) => p.auction_status === "upcoming" || p.auction_status === "available").length], ["Total money spent", m(sold.reduce((a, p) => a + Number(p.sold_price ?? 0), 0))], ["Average price", m(analysis.market.avgSoldPrice)], ["Valid squads", analysis.teams.filter((t) => t.rules.status === "valid").length + " / " + analysis.teams.length]].map(([k, v]) => <div key={String(k)} className="flex justify-between"><span className="text-muted">{k}</span><b className="tabular">{v}</b></div>)}
          </CardBody>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {analysis.teams.map((t) => (
          <Card key={t.team.id}>
            <CardHeader title={<TeamChip team={t.team} />} description={`${t.rating.count} players · avg ${fmtRating(t.rating.average)} · ${m(t.remaining)} left`} />
            <CardBody><ul className="text-xs">{t.entries.map((e) => <li key={e.player.id} className="flex justify-between border-t border-line/30 py-1"><span>{e.player.name} <span className="text-faint">{e.player.origin === "overseas" ? "OS" : "IN"} {e.player.category}</span></span><span className="tabular">{fmtRating(e.player.overall)} · {m(e.price)}</span></li>)}</ul></CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
