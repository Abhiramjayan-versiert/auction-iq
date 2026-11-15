// Shadow auction: a private parallel squad built from the same event's player pool.
import { analyseTeam, type EventAnalysis, type TeamAnalysis } from "./analysis";
import { round2 } from "./money";
import type { Player } from "./types";

export interface ShadowPick {
  player: Player;
  price: number;
}

export function shadowCompare(a: EventAnalysis, myTeamId: string, picks: ShadowPick[]) {
  const me = a.byId[myTeamId];
  const shadowTeam = { ...me.team, id: "shadow", name: "Shadow squad" };
  const shadow = analyseTeam(a.rules, shadowTeam, picks.map((p) => ({ player: p.player, price: p.price, source: "estimated" as const })), a.market, me.purseKnown ? me.initialPurse : undefined);
  const rank = (t: TeamAnalysis) => 1 + a.teams.filter((o) => o.team.id !== myTeamId && (o.official ?? -Infinity) > (t.official ?? -Infinity)).length;
  // missed opportunities: players others bought that beat my average at or below my average price
  const myAvg = me.rating.average ?? 0;
  const myAvgPrice = me.avgPrice ?? a.market.medianSoldPrice ?? Infinity;
  const missed = a.teams
    .filter((t) => t.team.id !== myTeamId)
    .flatMap((t) => t.entries.filter((e) => e.source === "official").map((e) => ({ ...e, team: t.team })))
    .filter((e) => (e.player.overall ?? 0) > myAvg && e.price <= myAvgPrice)
    .sort((x, y) => (y.player.overall ?? 0) / Math.max(y.price, 0.01) - (x.player.overall ?? 0) / Math.max(x.price, 0.01))
    .slice(0, 8);
  return {
    actual: me,
    shadow,
    actualRank: rank(me),
    shadowRank: rank(shadow),
    diff: {
      average: shadow.rating.average !== null && me.rating.average !== null ? round2(shadow.rating.average - me.rating.average) : null,
      total: round2(shadow.rating.total - me.rating.total),
      spent: round2(shadow.spent - me.spent),
      balance: round2(shadow.rating.balance - me.rating.balance),
    },
    missed,
  };
}
