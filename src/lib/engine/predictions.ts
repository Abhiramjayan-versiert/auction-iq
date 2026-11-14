import type { EventAnalysis, TeamAnalysis } from "./analysis";
import { round2 } from "./money";
import { cellAllowed, cellLabel, cellOf, type Cell } from "./rules";
import type { Player } from "./types";

export type Confidence = "high" | "medium" | "low";
export type Pressure = "low" | "medium" | "high" | "critical";

export interface CompetitorPrediction {
  teamId: string;
  teamName: string;
  pressure: Pressure;
  pressureRatio: number; // floor reserve / remaining purse
  biddingCapacity: number;
  likelyNext: { cell: Cell; confidence: Confidence; evidence: string[] }[];
  budgetExhaustionRisk: boolean;
  spendingStyle: "aggressive" | "steady" | "cautious";
  summary: string;
}

export interface ContestedPlayer {
  player: Player;
  interestedTeams: { teamId: string; teamName: string; capacity: number }[];
}

export function predictCompetitor(a: EventAnalysis, t: TeamAnalysis): CompetitorPrediction {
  const unit = a.rules.currency;
  const ratio = t.remaining > 0 ? t.floorReserve / t.remaining : t.floorReserve > 0 ? Infinity : 0;
  const pressure: Pressure = ratio >= 1 ? "critical" : ratio >= 0.7 ? "high" : ratio >= 0.4 ? "medium" : "low";
  const cells = [...new Set(t.rules.mandatoryPlan)];
  const likelyNext = cells
    .map((cell) => {
      const supply = a.market.supply[cell];
      const demand = a.market.demand[cell];
      const scarcity = supply ? demand / supply : Infinity;
      const needCount = t.rules.mandatoryPlan.filter((c) => c === cell).length;
      const evidence = [
        `Needs ${needCount} more ${cellLabel(cell).toLowerCase()}${needCount > 1 ? "s" : ""} to meet the rules.`,
        `${t.rules.slotsRequired} mandatory squad position(s) remain.`,
        `Current purse ${t.remaining} ${unit}.`,
        `${supply} such player(s) left in the pool, ${demand} team(s) need one.`,
      ];
      const confidence: Confidence = cells.length === 1 || scarcity >= 1 ? "high" : "medium";
      return { cell, confidence, evidence, score: scarcity * needCount };
    })
    .sort((x, y) => y.score - x.score)
    .map(({ cell, confidence, evidence }) => ({ cell, confidence, evidence }));
  const avg = t.avgPrice ?? a.market.avgSoldPrice ?? a.market.globalFloor;
  const budgetExhaustionRisk = t.rules.slotsRequired > 0 && avg * t.rules.slotsRequired > t.remaining;
  const spentFrac = t.utilization;
  const fillFrac = a.rules.squad_min ? t.rating.count / a.rules.squad_min : 0;
  const spendingStyle = spentFrac - fillFrac > 0.15 ? "aggressive" : fillFrac - spentFrac > 0.15 ? "cautious" : "steady";
  const summary = likelyNext.length
    ? `${t.team.short_name || t.team.name} may prioritise ${cellLabel(likelyNext[0].cell).toLowerCase()}.`
    : t.rules.complete
      ? `${t.team.short_name || t.team.name} has a complete squad; any further buys are discretionary.`
      : `${t.team.short_name || t.team.name} has flexible remaining slots.`;
  return {
    teamId: t.team.id,
    teamName: t.team.name,
    pressure,
    pressureRatio: Number.isFinite(ratio) ? round2(ratio) : 99,
    biddingCapacity: t.maxSingleBid,
    likelyNext,
    budgetExhaustionRisk,
    spendingStyle,
    summary,
  };
}

/** Available players that two or more teams both need and can afford. */
export function contestedPlayers(a: EventAnalysis, limit = 10): ContestedPlayer[] {
  return a.market.available
    .map((p) => ({
      player: p,
      interestedTeams: a.teams
        .filter(
          (t) =>
            cellAllowed(a.rules, t.rules.cellCounts, cellOf(p)).ok &&
            t.rules.mandatoryPlan.includes(cellOf(p)) &&
            t.maxSingleBid >= Number(p.base_price),
        )
        .map((t) => ({ teamId: t.team.id, teamName: t.team.name, capacity: t.maxSingleBid })),
    }))
    .filter((c) => c.interestedTeams.length >= 2)
    .sort((x, y) => (y.player.overall ?? 0) - (x.player.overall ?? 0) || y.interestedTeams.length - x.interestedTeams.length)
    .slice(0, limit);
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };
