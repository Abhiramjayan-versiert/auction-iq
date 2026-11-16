import { analyseTeam, completionPlan, FLOOR_SOURCE_LABEL, reserveFor, type EventAnalysis, type TeamAnalysis } from "./analysis";
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

export type Risk = "low" | "medium" | "high";

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
  /** minimum reserve to complete the squad AFTER this purchase (constrained optimisation) */
  minimumReserve: number;
  strategyReserve: number;
  discretionary: number;
  /** the strategy's recommended ceiling */
  maxBid: number;
  /** absolute ceiling that still leaves the minimum reserve — never exceed this */
  maxSafeBid: number;
  /** purse left if bought at the suggested bid */
  purseAfter: number;
  risk: Risk;
  qualityPercentile: number;
  remainingRequirementsAfter: number;
  competitorDemand: CompetitorDemand[];
  estimatedPriceToWin: number | null;
  winnable: boolean | null;
  expectedValue: number | null;
  leaderboardBefore: number | null;
  leaderboardAfter: number | null;
  reasoning: string[];
  /** missing information that limits reliability */
  limitations: string[];
}

function percentile(p: Player, pool: Player[]) {
  const rs = pool.map((x) => x.overall).filter((x): x is number => typeof x === "number");
  if (!rs.length || p.overall === null) return 0.5;
  const below = rs.filter((r) => r < (p.overall as number)).length;
  const equal = rs.filter((r) => r === p.overall).length;
  return (below + equal / 2) / rs.length;
}

/** Core bid ceiling calculation for one team (no competitor recursion). */
function ceiling(a: EventAnalysis, t: TeamAnalysis, p: Player, strategy: Strategy) {
  const cell = cellOf(p);
  const allowed = cellAllowed(a.rules, t.rules.cellCounts, cell, t.rules.size);
  const none = { allowed, after: null, maxBid: 0, maxSafe: 0, reserve: 0, floorReserve: 0, discretionary: 0, q: 0, fills: false, spread: 1 };
  if (!allowed.ok || !t.purseKnown) return { ...none, allowed: !t.purseKnown && allowed.ok ? { ok: false, reason: `${t.team.name}'s initial purse has not been set.` } : allowed };
  const after = analyseTeam(a.rules, t.team, [...t.entries, { player: p, price: 0, source: "estimated" }], a.market, t.initialPurse);
  const fills = (cell !== null && t.rules.mandatoryPlan.includes(cell)) || after.rules.slotsRequired < t.rules.slotsRequired;
  const floorReserve = completionPlan(a.rules, after.rules, a.market, "floor").cost;
  const reserve = reserveFor(after.rules, a.market, strategy);
  const discretionary = round2(t.remaining - reserve);
  // the event's purse rule (when enforced) is a hard cap the server will apply
  const maxSafe = round2(Math.max(0, Math.min(t.remaining - floorReserve, a.rules.enforce_max_bid ? t.ruleMaxBid : Infinity)));
  // rating percentile among every player recorded this event (the pool is built live)
  const universe = a.market.available.length >= 5 ? a.market.available : [...a.market.available, ...a.teams.flatMap((x) => x.players)];
  const q = percentile(p, universe.length ? universe : [p]);
  const { cap } = STRATEGY_PARAMS[strategy];
  const qualityMult = 0.35 + 0.65 * q;
  const needMult = fills ? 1 : 0.7;
  const spread = Math.min(1, 3 / (after.rules.slotsRequired + 1));
  let maxBid = 0;
  const base = Number(p.base_price) || 0;
  if (discretionary >= base) {
    maxBid = Math.min(discretionary, Math.max(base, discretionary * cap * qualityMult * needMult * spread));
    maxBid = Math.max(base, floorToIncrement(maxBid, a.rules.bid_increment));
  }
  maxBid = Math.min(maxBid, maxSafe);
  if (maxBid < base || maxBid <= 0) maxBid = 0;
  return { allowed, after, maxBid: round2(maxBid), maxSafe, reserve, floorReserve, discretionary, q, fills, spread };
}

export function smartBid(a: EventAnalysis, myTeamId: string, p: Player, strategy: Strategy): SmartBidResult {
  const t = a.byId[myTeamId];
  const c = ceiling(a, t, p, strategy);
  const unit = a.rules.currency;
  const reasoning: string[] = [];
  const limitations: string[] = [];
  const cell = cellOf(p);
  if (p.overall === null) limitations.push("Player rating not recorded — quality is assumed to be average.");
  if (cell === null && a.rules.constraints.length) limitations.push("Player role/origin not recorded — category rules and needs can't be checked.");
  if (a.market.floorSource === "none") limitations.push(`Reserve: ${FLOOR_SOURCE_LABEL.none}.`);
  else if (a.market.floorSource === "observed_sales") limitations.push(`Reserve uses the ${FLOOR_SOURCE_LABEL.observed_sales}.`);
  if (t.completion.provisional && a.market.floorSource !== "none") limitations.push("Too few unsold players recorded to price every remaining slot — reserve is provisional.");

  const competitors: CompetitorDemand[] = a.teams
    .filter((o) => o.team.id !== myTeamId && o.purseKnown)
    .map((o) => {
      const oc = ceiling(a, o, p, "balanced");
      return {
        teamId: o.team.id,
        teamName: o.team.name,
        needsCell: cell !== null && o.rules.mandatoryPlan.includes(cell),
        canAdd: oc.allowed.ok,
        capacity: oc.allowed.ok ? oc.maxSafe : 0,
        likelyCeiling: oc.maxBid,
      };
    })
    .filter((d) => d.canAdd && d.capacity >= (Number(p.base_price) || 0) && d.capacity > 0)
    .sort((x, y) => y.likelyCeiling - x.likelyCeiling);
  const top = competitors[0];
  const base = Number(p.base_price) || 0;
  const estimatedPriceToWin = top ? round2(Math.max(base, top.likelyCeiling + a.rules.bid_increment)) : base;

  if (!c.allowed.ok) {
    reasoning.push(`Blocked: ${c.allowed.reason}`);
  } else {
    const after = c.after!;
    reasoning.push(`Remaining purse ${t.remaining} ${unit}.`);
    reasoning.push(
      `After this purchase you still need ${after.rules.slotsRequired} player(s)${
        after.rules.mandatoryPlan.length ? ` (${[...new Set(after.rules.mandatoryPlan)].map(cellLabel).join(", ")})` : ""
      }.`,
    );
    reasoning.push(`Minimum completion cost after this purchase: ${c.floorReserve} ${unit}; ${STRATEGY_PARAMS[strategy].label.toLowerCase()} reserve: ${c.reserve} ${unit}.`);
    reasoning.push(`Maximum safe bid = ${t.remaining} − ${c.floorReserve} = ${c.maxSafe} ${unit} (never go above this).`);
    reasoning.push(`Free budget for this strategy = ${t.remaining} − ${c.reserve} = ${c.discretionary} ${unit}.`);
    reasoning.push(
      `Rating ${p.overall ?? "not recorded"} is around the ${Math.round(c.q * 100)}th percentile of players recorded so far; ${
        c.fills ? "fills a mandatory requirement" : "does not fill a mandatory requirement (30% discount)"
      }.`,
    );
    if (c.maxBid === 0) reasoning.push(`Free budget is below the base price (${base}); bidding would endanger squad completion.`);
    else
      reasoning.push(
        `Suggested bid ${c.maxBid} ${unit} = free budget × ${Math.round(STRATEGY_PARAMS[strategy].cap * 100)}% strategy cap × quality × need${
          c.spread < 1 ? ` × ${c.spread.toFixed(2)} spread (budget kept for ${after.rules.slotsRequired} more players)` : ""
        }, rounded to the bid increment.`,
      );
    if (top) reasoning.push(`${competitors.length} competitor(s) can afford this player; strongest likely ceiling (estimate): ${top.teamName} at ~${top.likelyCeiling} ${unit}.`);
    else reasoning.push("No competitor with a known purse currently has both a free slot and the budget for this player.");
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
  const purseAfter = c.allowed.ok ? round2(t.remaining - c.maxBid) : t.remaining;
  const headroom = c.allowed.ok ? round2(purseAfter - c.floorReserve) : 0;
  const risk: Risk = !c.allowed.ok || c.maxBid === 0 ? "high" : headroom < c.floorReserve * 0.25 || c.maxBid > c.maxSafe * 0.8 ? "high" : headroom < c.floorReserve ? "medium" : "low";
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
    maxSafeBid: c.maxSafe,
    purseAfter,
    risk,
    qualityPercentile: c.q,
    remainingRequirementsAfter: after?.rules.slotsRequired ?? t.rules.slotsRequired,
    competitorDemand: competitors,
    estimatedPriceToWin,
    winnable: c.allowed.ok ? c.maxBid >= estimatedPriceToWin : null,
    expectedValue: c.maxBid > 0 && p.overall !== null ? round2(p.overall / c.maxBid) : null,
    leaderboardBefore: lbBefore,
    leaderboardAfter: lbAfter,
    reasoning,
    limitations,
  };
}

/** A player typed in by the participant (e.g. the one currently on the block, not yet entered by the operator). */
export function hypotheticalPlayer(input: { name?: string; rating: number | null; category?: Player["category"]; origin?: Player["origin"]; base?: number | null }): Player {
  return {
    id: `hyp-${input.name ?? "player"}`,
    name: input.name?.trim() || "Player on the block",
    origin: input.origin ?? null,
    category: input.category ?? null,
    base_price: input.base ?? 0,
    overall: input.rating,
    batting: null,
    bowling: null,
    auction_status: "available",
  };
}
