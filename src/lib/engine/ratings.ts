import { mean, round2 } from "./money";
import type { RuleEvaluation } from "./rules";
import type { Player, RuleSet, Weights } from "./types";

export interface TeamRating {
  count: number;
  total: number;
  /** Official basic formula: total of overall ratings / players purchased. */
  average: number | null;
  batting: number | null;
  bowling: number | null;
  allrounder: number | null;
  wicketkeeping: number | null;
  fielding: number | null;
  /** 0..100 */
  balance: number;
  /** analytical weighted score on rating scale */
  weighted: number | null;
}

const vals = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => typeof x === "number" && !Number.isNaN(x));

export function balanceScore(rules: RuleSet, evaluation: RuleEvaluation, players: Player[]) {
  const mins = evaluation.statuses.filter((s) => s.constraint.min !== null && (s.constraint.min as number) > 0);
  const progress = mins.length
    ? mins.reduce((a, s) => a + Math.min(s.count, s.constraint.min as number) / (s.constraint.min as number), 0) / mins.length
    : Math.min(1, players.length / Math.max(1, rules.squad_min));
  const cats = new Set(players.map((p) => p.category)).size;
  const coverage = cats / 4;
  const violations = evaluation.statuses.filter((s) => s.state === "violation").length;
  return Math.max(0, Math.min(100, round2((0.7 * progress + 0.3 * coverage) * 100 - violations * 25)));
}

export function weightedScore(r: Omit<TeamRating, "weighted">, w: Weights, scale: number) {
  const comps: [number, number | null][] = [
    [w.batting, r.batting],
    [w.bowling, r.bowling],
    [w.allrounder, r.allrounder],
    [w.wicketkeeping, r.wicketkeeping],
    [w.fielding, r.fielding],
    [w.balance, (r.balance / 100) * scale],
  ];
  const totalW = comps.reduce((a, [wt]) => a + wt, 0);
  if (!totalW || r.count === 0) return null;
  // Missing components score 0: an analytical team with no wicketkeeper is genuinely weaker.
  return round2(comps.reduce((a, [wt, v]) => a + wt * (v ?? 0), 0) / totalW);
}

export function rateTeam(rules: RuleSet, evaluation: RuleEvaluation, players: Player[]): TeamRating {
  const overall = vals(players.map((p) => p.overall));
  const total = round2(overall.reduce((a, b) => a + b, 0));
  const avg = (xs: number[]) => {
    const m = mean(xs);
    return m === null ? null : round2(m);
  };
  const base = {
    count: players.length,
    total,
    average: overall.length ? round2(total / overall.length) : null,
    batting: avg(vals(players.filter((p) => p.category !== "BOWL").map((p) => p.batting ?? null))),
    bowling: avg(vals(players.filter((p) => p.category === "BOWL" || p.category === "AR").map((p) => p.bowling ?? null))),
    allrounder: avg(vals(players.filter((p) => p.category === "AR").map((p) => p.overall))),
    wicketkeeping: avg(vals(players.filter((p) => p.category === "WK").map((p) => p.wicketkeeping ?? p.overall))),
    fielding: avg(vals(players.map((p) => p.fielding ?? null))),
    balance: balanceScore(rules, evaluation, players),
  };
  return { ...base, weighted: weightedScore(base, rules.weights, rules.rating_scale_max) };
}

/** Official ranking metric strictly follows the competition's configured formula. */
export function officialMetric(rules: RuleSet, r: TeamRating) {
  if (rules.ranking_formula === "total") return r.count ? r.total : null;
  if (rules.ranking_formula === "weighted") return r.weighted;
  return r.average;
}

export const FORMULA_LABEL = {
  average: "Average rating (total ÷ players)",
  total: "Total rating",
  weighted: "Weighted score (event weights)",
} as const;
