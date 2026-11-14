import { analyseTeam, reserveFor, type EventAnalysis, type TeamAnalysis } from "./analysis";
import { floorToIncrement, round2 } from "./money";
import { cellAllowed, cellLabel, cellOf } from "./rules";
import type { Player, Strategy } from "./types";

export const STRATEGY_PARAMS: Record<Strategy, { cap: number; label: string; description: string }> = {
  conservative: { cap: 0.45, label: "Conservative", description: "Reserves at realistic market prices and commits at most 45% of free budget to one player." },
  balanced: { cap: 0.6, label: "Balanced", description: "Reserves midway between floor and market prices; up to 60% of free budget on one player." },
  aggressive: { cap: 0.85, label: "Aggressive", description: "Reserves only floor prices for mandatory slots; up to 85% of free budget on one player." },
};

export interface CompetitorDemand {
  teamId: string;
  teamName: string;
  needsCell: boolean;
  canAdd: boolean;
  capacity: number; // largest bid they can make and still complete squad
  likelyCeiling: number; // their balanced smart-bid ceiling for this player
}

export interface SmartBidResult {
  player: Player;
  strategy: Strategy;
  eligible: boolean;
  blockedReason: string | null;
  fillsRequirement: boolean;
  currentAverage: number | null;
  projectedAverage: number | null;
  ratingDelta: number | null;
  currentProjectedFinal: number | null;
  projectedFinalAfter: number | null;
  remainingPurse: number;
  minimumReserve: number; // floor reserve after this purchase
  strategyReserve: number;
  discretionary: number;
  maxBid: number;
  qualityPercentile: number;
  remainingRequirementsAfter: number;
  competitorDemand: CompetitorDemand[];
  estimatedPriceToWin: number | null;
  winnable: boolean | null;
  expectedValue: number | null; // rating points gained in team total per currency unit at max bid
  leaderboardBefore: number | null;
  leaderboardAfter: number | null;
  reasoning: string[];
}

function percentile(p: Player, pool: Player[]) {
  const rs = pool.map((x) => x.overall ?? 0);
  if (!rs.length || p.overall === null) return 0.5;
  const below = rs.filter((r) => r < (p.overall as number)).length;
  const equal = rs.filter((r) => r === p.overall).length;
  return (below + equal / 2) / rs.length;
}

/** Core bid ceiling calculation for one team (no competitor recursion). */
function ceiling(a: EventAnalysis, t: TeamAnalysis, p: Player, strategy: Strategy) {
  const cell = cellOf(p);
  const allowed = cellAllowed(a.rules, t.rules.cellCounts, cell);
  if (!allowed.ok) return { allowed, after: null, maxBid: 0, reserve: 0, floorReserve: 0, discretionary: 0, q: 0, fills: false };
  const after = analyseTeam(a.rules, t.team, [...t.entries, { player: p, price: 0, source: "estimated" }], a.market, t.initialPurse);
  const fills = t.rules.mandatoryPlan.includes(cell) || after.rules.slotsRequired < t.rules.slotsRequired;
  const floorReserve = reserveFor(after.rules, a.market, "floor");
  const reserve = reserveFor(after.rules, a.market, strategy);
  const discretionary = round2(t.remaining - reserve);
  const q = percentile(p, a.market.available.length ? a.market.available : [p]);
  const { cap } = STRATEGY_PARAMS[strategy];
  const qualityMult = 0.35 + 0.65 * q;
  const needMult = fills ? 1 : 0.7;
  let maxBid = 0;
  const base = Number(p.base_price);
  if (discretionary >= base) {
    maxBid = Math.min(discretionary, Math.max(base, discretionary * cap * qualityMult * needMult));
    maxBid = Math.max(base, floorToIncrement(maxBid, a.rules.bid_increment));
  }
  // Hard safety limit: never suggest more than purse minus floor reserve.
  maxBid = Math.min(maxBid, round2(t.remaining - floorReserve));
  if (maxBid < base) maxBid = 0;
  return { allowed, after, maxBid: round2(maxBid), reserve, floorReserve, discretionary, q, fills };
}

export function smartBid(a: EventAnalysis, myTeamId: string, p: Player, strategy: Strategy): SmartBidResult {
  const t = a.byId[myTeamId];
  const c = ceiling(a, t, p, strategy);
  const unit = a.rules.currency;
  const reasoning: string[] = [];
  const cell = cellOf(p);
  const competitors: CompetitorDemand[] = a.teams
    .filter((o) => o.team.id !== myTeamId)
    .map((o) => {
      const oc = ceiling(a, o, p, "balanced");
      return {
        teamId: o.team.id,
        teamName: o.team.name,
        needsCell: o.rules.mandatoryPlan.includes(cell),
        canAdd: oc.allowed.ok,
        capacity: oc.allowed.ok ? round2(Math.max(0, o.remaining - oc.floorReserve)) : 0,
        likelyCeiling: oc.maxBid,
      };
    })
    .filter((d) => d.canAdd && d.capacity >= Number(p.base_price))
    .sort((x, y) => y.likelyCeiling - x.likelyCeiling);

  const top = competitors[0];
  const estimatedPriceToWin = top ? round2(Math.max(Number(p.base_price), top.likelyCeiling + a.rules.bid_increment)) : Number(p.base_price);

  if (!c.allowed.ok) {
    reasoning.push(`Blocked: ${c.allowed.reason}`);
  } else {
    reasoning.push(`Remaining purse ${t.remaining} ${unit}.`);
    const after = c.after!;
    reasoning.push(
      `After this purchase you still need ${after.rules.slotsRequired} player(s)${
        after.rules.mandatoryPlan.length ? ` (${after.rules.mandatoryPlan.map(cellLabel).join(", ")})` : ""
      }.`,
    );
    reasoning.push(`Minimum reserve at floor prices: ${c.floorReserve} ${unit}; ${STRATEGY_PARAMS[strategy].label.toLowerCase()} reserve: ${c.reserve} ${unit}.`);
    reasoning.push(`Discretionary budget = ${t.remaining} − ${c.reserve} = ${c.discretionary} ${unit}.`);
    reasoning.push(
      `Rating ${p.overall ?? "n/a"} is in the ${Math.round(c.q * 100)}th percentile of the remaining pool; ${
        c.fills ? "fills a mandatory requirement" : "does not fill a mandatory requirement (30% discount)"
      }.`,
    );
    if (c.maxBid === 0) reasoning.push(`Discretionary budget is below the base price (${p.base_price}); bidding would endanger squad completion.`);
    else reasoning.push(`Suggested ceiling ${c.maxBid} ${unit} (cap ${Math.round(STRATEGY_PARAMS[strategy].cap * 100)}% × quality × need, rounded to the bid increment).`);
    if (top) reasoning.push(`${competitors.length} competitor(s) can afford this player; strongest likely ceiling: ${top.teamName} at ~${top.likelyCeiling} ${unit}.`);
    else reasoning.push("No competitor currently has both a free slot and the budget for this player.");
  }

  const after = c.after;
  const currentAverage = t.rating.average;
  const projectedAverage = after ? after.rating.average : null;
  const lbBefore = a.leaderboard.find((r) => r.teamId === myTeamId)?.officialRank ?? null;
  let lbAfter: number | null = null;
  if (after) {
    const metric = after.official ?? 0;
    lbAfter = 1 + a.teams.filter((o) => o.team.id !== myTeamId && (o.official ?? -Infinity) > metric).length;
  }
  return {
    player: p,
    strategy,
    eligible: c.allowed.ok && c.maxBid > 0,
    blockedReason: c.allowed.ok ? null : c.allowed.reason,
    fillsRequirement: c.fills,
    currentAverage,
    projectedAverage,
    ratingDelta: currentAverage !== null && projectedAverage !== null ? round2(projectedAverage - currentAverage) : projectedAverage,
    currentProjectedFinal: t.projectedAverage,
    projectedFinalAfter: after?.projectedAverage ?? null,
    remainingPurse: t.remaining,
    minimumReserve: c.floorReserve,
    strategyReserve: c.reserve,
    discretionary: c.discretionary,
    maxBid: c.maxBid,
    qualityPercentile: c.q,
    remainingRequirementsAfter: after?.rules.slotsRequired ?? t.rules.slotsRequired,
    competitorDemand: competitors,
    estimatedPriceToWin,
    winnable: c.allowed.ok ? c.maxBid >= estimatedPriceToWin : null,
    expectedValue: c.maxBid > 0 && p.overall !== null ? round2(p.overall / c.maxBid) : null,
    leaderboardBefore: lbBefore,
    leaderboardAfter: lbAfter,
    reasoning,
  };
}
