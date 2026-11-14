import type { EventAnalysis, TeamAnalysis } from "./analysis";
import { mean } from "./money";

export type CompetitorFlag =
  | "financially_strong"
  | "financially_weak"
  | "aggressive_spender"
  | "high_quality"
  | "incomplete"
  | "category_shortage"
  | "best_positioned";

export const FLAG_LABEL: Record<CompetitorFlag, string> = {
  financially_strong: "Financially strong",
  financially_weak: "Financially weak",
  aggressive_spender: "Spending aggressively",
  high_quality: "High player quality",
  incomplete: "Incomplete squad",
  category_shortage: "Category shortage",
  best_positioned: "Best placed for remaining players",
};

export function classifyTeams(a: EventAnalysis): Record<string, CompetitorFlag[]> {
  const disc = a.teams.map((t) => t.discretionary);
  const avgDisc = mean(disc) ?? 0;
  const avgs = a.teams.map((t) => t.rating.average).filter((x): x is number => x !== null);
  const avgRating = mean(avgs) ?? 0;
  const sortedDisc = [...a.teams].sort((x, y) => y.maxSingleBid - x.maxSingleBid);
  const top = new Set(sortedDisc.slice(0, Math.max(1, Math.ceil(a.teams.length / 5))).map((t) => t.team.id));
  const out: Record<string, CompetitorFlag[]> = {};
  for (const t of a.teams) {
    const f: CompetitorFlag[] = [];
    if (t.discretionary > avgDisc * 1.2) f.push("financially_strong");
    if (t.discretionary < avgDisc * 0.6 || !t.purseSufficient) f.push("financially_weak");
    const fill = a.rules.squad_min ? t.rating.count / a.rules.squad_min : 0;
    if (t.utilization - fill > 0.15) f.push("aggressive_spender");
    if (t.rating.average !== null && t.rating.average > avgRating + 0.15) f.push("high_quality");
    if (!t.rules.complete) f.push("incomplete");
    if (t.rules.mandatoryPlan.some((c) => a.market.supply[c] < a.market.demand[c])) f.push("category_shortage");
    if (top.has(t.team.id) && t.rules.slotsRemaining > 0) f.push("best_positioned");
    out[t.team.id] = f;
  }
  return out;
}

export function strongestDimension(t: TeamAnalysis) {
  const dims = [
    ["Batting", t.rating.batting],
    ["Bowling", t.rating.bowling],
    ["All-round", t.rating.allrounder],
    ["Wicketkeeping", t.rating.wicketkeeping],
    ["Fielding", t.rating.fielding],
  ] as const;
  const present = dims.filter(([, v]) => v !== null) as [string, number][];
  if (!present.length) return null;
  present.sort((a, b) => b[1] - a[1]);
  return { best: present[0], worst: present[present.length - 1] };
}
