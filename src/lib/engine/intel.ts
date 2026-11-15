// Advanced deterministic intelligence built on top of the event analysis.
// Every function works with whatever data has been recorded live, and reports
// (rather than invents) anything it cannot know.
import { analyseTeam, completionPlan, type EventAnalysis, type TeamAnalysis } from "./analysis";
import { mean, median, round2 } from "./money";
import type { Confidence } from "./predictions";
import { predictCompetitor } from "./predictions";
import { ALL_CELLS, cellAllowed, cellLabel, cellOf, type Cell } from "./rules";
import { CATEGORY_LABEL, type Category, type Player } from "./types";

const rated = (ps: Player[]) => ps.filter((p): p is Player & { overall: number } => typeof p.overall === "number");

// ---------------------------------------------------------------------------
// Weakness scanner
// ---------------------------------------------------------------------------
export interface Weakness {
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detected: string;
  why: string;
  improve: string;
  impact: string;
  confidence: Confidence;
  calculation: string;
}

function knownCategoryShare(ps: Player[]) {
  return ps.length ? ps.filter((p) => p.category).length / ps.length : 0;
}

export function weaknessScan(a: EventAnalysis, teamId: string): Weakness[] {
  const t = a.byId[teamId];
  if (!t) return [];
  const out: Weakness[] = [];
  const unit = a.rules.currency;
  const pool = a.market.available;
  const categoryDataOk = a.market.categoryCoverage >= 0.5 && knownCategoryShare(t.players) >= 0.6 && t.players.length >= 2;
  const suggest = (filter: (p: Player) => boolean, score: (p: Player) => number) => {
    const list = pool.filter((p) => filter(p) && cellAllowed(a.rules, t.rules.cellCounts, cellOf(p), t.rules.size).ok).sort((x, y) => score(y) - score(x)).slice(0, 3);
    return list.length ? `Recorded options: ${list.map((p) => `${p.name} (${p.overall ?? "unrated"})`).join(", ")}.` : "No suitable unsold player has been recorded yet — watch for one on the block.";
  };

  if (categoryDataOk) {
    for (const dim of ["batting", "bowling"] as const) {
      const mine = t.rating[dim];
      const others = a.teams.filter((x) => x.team.id !== teamId).map((x) => x.rating[dim]).filter((v): v is number => v !== null);
      const avg = mean(others);
      if (mine !== null && avg !== null && avg - mine > 0.3) {
        out.push({
          kind: `low-${dim}`,
          severity: "warning",
          title: `${dim === "batting" ? "Batting" : "Bowling"} is below the field`,
          detected: `Your ${dim} average is ${mine.toFixed(2)} vs ${avg.toFixed(2)} across other teams.`,
          why: "It drags down weighted strength and limits rating upside in that department.",
          improve: suggest((p) => (dim === "batting" ? p.category === "BAT" || p.category === "WK" || p.category === "AR" : p.category === "BOWL" || p.category === "AR"), (p) => (dim === "batting" ? p.batting ?? p.overall ?? 0 : p.bowling ?? p.overall ?? 0)),
          impact: `Gap of ${round2(avg - mine)} rating points.`,
          confidence: others.length >= 3 ? "medium" : "low",
          calculation: `mean of ${others.length} teams' ${dim} averages = ${avg.toFixed(2)}`,
        });
      }
    }
    const known = t.players.filter((p) => p.category);
    const byCat = new Map<Category, number>();
    known.forEach((p) => byCat.set(p.category as Category, (byCat.get(p.category as Category) ?? 0) + 1));
    for (const [cat, n] of byCat) {
      if (n >= 3 && n / known.length > 0.5) {
        out.push({
          kind: `concentration-${cat}`,
          severity: "info",
          title: `Heavy on ${CATEGORY_LABEL[cat].toLowerCase()}s`,
          detected: `${n} of your ${known.length} players with a recorded role are ${CATEGORY_LABEL[cat].toLowerCase()}s.`,
          why: "Concentration leaves other departments thin and reduces squad balance.",
          improve: "Prioritise other roles for remaining slots.",
          impact: `Balance score ${t.rating.balance.toFixed(0)}/100.`,
          confidence: "high",
          calculation: `${n}/${known.length} = ${Math.round((n / known.length) * 100)}%`,
        });
      }
    }
    const arNeeded = t.rules.statuses.find((s) => s.constraint.category === "AR" && s.state === "incomplete");
    if (!arNeeded && !byCat.get("AR") && t.rating.count >= Math.ceil(a.rules.squad_min / 2)) {
      out.push({
        kind: "no-ar",
        severity: "info",
        title: "No all-rounders yet",
        detected: `You have ${t.rating.count} players and no recorded all-rounder.`,
        why: "All-rounders count towards batting and bowling strength.",
        improve: suggest((p) => p.category === "AR", (p) => p.overall ?? 0),
        impact: "Improves balance and both strength scores.",
        confidence: "medium",
        calculation: "all-rounders = 0",
      });
    }
  }

  if (t.rules.slotsRequired > 0 && t.rules.slotsRequired >= t.rules.slotsRemaining && t.rules.slotsRemaining > 0) {
    out.push({
      kind: "all-mandatory",
      severity: "warning",
      title: "No room left for discretionary picks",
      detected: `All ${t.rules.slotsRemaining} remaining slots are needed to satisfy the rules.`,
      why: "Every purchase from now must fill a requirement or the squad becomes invalid.",
      improve: `Remaining needs: ${[...new Set(t.rules.mandatoryPlan)].map(cellLabel).join(", ") || "any role"}.`,
      impact: "Squad validity.",
      confidence: "high",
      calculation: `required ${t.rules.slotsRequired} = slots left ${t.rules.slotsRemaining}`,
    });
  }
  if (t.purseKnown && t.initialPurse > 0 && t.remaining / t.initialPurse < 0.15 && t.rules.slotsRequired > 0) {
    out.push({
      kind: "low-purse",
      severity: "warning",
      title: "Very little purse left",
      detected: `${t.remaining} ${unit} left (${Math.round((t.remaining / t.initialPurse) * 100)}%) with ${t.rules.slotsRequired} player(s) still required.`,
      why: "You'll be limited to the cheapest players for the rest of the auction.",
      improve: `Bid only on required roles, at most ${t.maxSingleBid} ${unit} per player.`,
      impact: `Minimum completion cost ${t.floorReserve} ${unit}${t.completion.provisional ? " (provisional)" : ""}.`,
      confidence: "high",
      calculation: `${t.remaining} / ${t.initialPurse}`,
    });
  }
  const effs = a.teams.filter((x) => x.spent > 0 && x.rating.ratedCount >= 2).map((x) => x.rating.total / x.spent);
  const medEff = median(effs);
  if (t.spent > 0 && t.rating.ratedCount >= 2 && medEff && effs.length >= 3 && t.rating.total / t.spent < medEff * 0.75) {
    out.push({
      kind: "efficiency",
      severity: "info",
      title: "Paying more per rating point than most teams",
      detected: `You get ${(t.rating.total / t.spent).toFixed(2)} rating points per ${unit} vs a median of ${medEff.toFixed(2)}.`,
      why: "Overpaying now reduces the budget for remaining slots.",
      improve: "Use the Player Value Analyzer to find better-value targets.",
      impact: `${Math.round((1 - t.rating.total / t.spent / medEff) * 100)}% less efficient than the median team.`,
      confidence: effs.length >= 5 ? "medium" : "low",
      calculation: `${t.rating.total} ÷ ${t.spent}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Competitor financial intelligence
// ---------------------------------------------------------------------------
export function financialIntel(a: EventAnalysis) {
  const known = a.teams.filter((t) => t.purseKnown);
  const by = (f: (t: TeamAnalysis) => number, dir = -1) => [...known].sort((x, y) => dir * (f(x) - f(y)));
  const medSold = a.market.medianSoldPrice;
  const fill = (t: TeamAnalysis) => (a.rules.squad_min ? t.rating.count / a.rules.squad_min : 0);
  return {
    highestPurse: by((t) => t.remaining).slice(0, 3),
    lowestPurse: by((t) => t.remaining, 1).slice(0, 3),
    aggressive: known.filter((t) => t.utilization - fill(t) > 0.15),
    conservative: known.filter((t) => fill(t) - t.utilization > 0.15),
    largeRequirements: a.teams.filter((t) => t.rules.slotsRequired >= Math.ceil(a.rules.squad_min / 2)),
    limitedFlexibility: medSold === null ? [] : known.filter((t) => t.rules.slotsRemaining > 0 && t.maxSingleBid < medSold),
    unknownPurse: a.teams.filter((t) => !t.purseKnown),
  };
}

// ---------------------------------------------------------------------------
// Price model + opponent aggression index (winning prices only)
// ---------------------------------------------------------------------------
export interface PriceModel {
  kind: "regression" | "median" | "none";
  predict: (rating: number | null) => number | null;
  n: number;
  description: string;
}

export function priceModel(a: EventAnalysis): PriceModel {
  const sales = a.teams.flatMap((t) => t.entries.filter((e) => e.source === "official"));
  const pts = sales.filter((e) => typeof e.player.overall === "number").map((e) => [e.player.overall as number, e.price] as const);
  if (pts.length >= 4) {
    const mx = mean(pts.map((p) => p[0])) as number;
    const my = mean(pts.map((p) => p[1])) as number;
    const sxx = pts.reduce((s, [x]) => s + (x - mx) ** 2, 0);
    const slope = sxx > 1e-9 ? pts.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx : 0;
    const icpt = my - slope * mx;
    return {
      kind: "regression",
      n: pts.length,
      predict: (r) => (r === null ? my : Math.max(a.market.globalFloor, icpt + slope * r)),
      description: `price ≈ ${round2(icpt)} + ${round2(slope)} × rating (fitted on ${pts.length} rated sales)`,
    };
  }
  const prices = sales.map((e) => e.price);
  const med = median(prices);
  if (med !== null) return { kind: "median", n: prices.length, predict: () => med, description: `median winning price ${round2(med)} (${prices.length} sales; too few rated sales for a rating model)` };
  return { kind: "none", n: 0, predict: () => null, description: "no sales recorded yet" };
}

export type AggressionClass = "conservative" | "balanced" | "aggressive" | "highly_aggressive";
export interface AggressionScore {
  teamId: string;
  teamName: string;
  index: number | null; // 1.0 = pays the going rate
  cls: AggressionClass | null;
  purchases: number;
  confidence: Confidence;
  basis: string;
}

export const AGGRESSION_LABEL: Record<AggressionClass, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
  highly_aggressive: "Highly aggressive",
};

export const AGGRESSION_CAVEAT =
  "Only winning prices are recorded (losing bids are not), so aggression is inferred from what each team paid relative to the going rate — treat it as indicative.";

export function aggressionIndex(a: EventAnalysis): AggressionScore[] {
  const model = priceModel(a);
  return a.teams.map((t) => {
    const official = t.entries.filter((e) => e.source === "official");
    const ratios: number[] = [];
    let basis = "";
    const withBase = official.filter((e) => Number(e.player.base_price) > 0);
    if (withBase.length >= Math.max(1, official.length / 2)) {
      withBase.forEach((e) => ratios.push(e.price / Number(e.player.base_price)));
      basis = "price paid ÷ base price";
    } else if (model.kind !== "none") {
      official.forEach((e) => {
        const p = model.predict(e.player.overall);
        if (p && p > 0) ratios.push(e.price / p);
      });
      basis = `price paid ÷ going rate (${model.description})`;
    }
    const idx = ratios.length ? round2(mean(ratios) as number) : null;
    // with base prices, paying 1.0× is cheap; normalise so 1.0 ≈ going rate
    const norm = idx === null ? null : basis.startsWith("price paid ÷ base") ? idx / Math.max(1, median(a.teams.flatMap((x) => x.entries.filter((e) => Number(e.player.base_price) > 0).map((e) => e.price / Number(e.player.base_price)))) ?? 1) : idx;
    const cls: AggressionClass | null = norm === null ? null : norm < 0.85 ? "conservative" : norm < 1.15 ? "balanced" : norm < 1.5 ? "aggressive" : "highly_aggressive";
    return {
      teamId: t.team.id,
      teamName: t.team.name,
      index: norm === null ? null : round2(norm),
      cls,
      purchases: official.length,
      confidence: official.length >= 4 ? "medium" : "low",
      basis: basis || "no purchases yet",
    };
  });
}

// ---------------------------------------------------------------------------
// Competitor DNA
// ---------------------------------------------------------------------------
export function competitorDNA(a: EventAnalysis, teamId: string) {
  const t = a.byId[teamId];
  const agg = aggressionIndex(a).find((x) => x.teamId === teamId)!;
  const allPrices = a.teams.flatMap((x) => x.entries.map((e) => e.price)).sort((x, y) => x - y);
  const p75 = allPrices.length ? allPrices[Math.floor(allPrices.length * 0.75)] : null;
  const premium = p75 === null ? 0 : t.entries.filter((e) => e.price >= p75).reduce((s, e) => s + e.price, 0);
  const cats = new Map<string, { n: number; spend: number }>();
  t.entries.forEach((e) => {
    const k = e.player.category ? CATEGORY_LABEL[e.player.category] : "Role not recorded";
    const c = cats.get(k) ?? { n: 0, spend: 0 };
    c.n++;
    c.spend += e.price;
    cats.set(k, c);
  });
  return {
    team: t,
    aggression: agg,
    avgPrice: t.avgPrice,
    premiumShare: t.spent > 0 ? premium / t.spent : null,
    categoryPreferences: [...cats.entries()].map(([k, v]) => ({ category: k, ...v })).sort((x, y) => y.spend - x.spend),
    flexibility: { remaining: t.remaining, maxSingleBid: t.maxSingleBid, minCompletion: t.floorReserve, purseKnown: t.purseKnown },
    weaknesses: weaknessScan(a, teamId).map((w) => w.title),
    priorities: predictCompetitor(a, t),
  };
}

// ---------------------------------------------------------------------------
// Leader Hunter
// ---------------------------------------------------------------------------
export function leaderHunter(a: EventAnalysis, myTeamId: string) {
  const me = a.byId[myTeamId];
  const lb = a.leaderboard.filter((r) => r.officialValue !== null);
  const leaderRow = lb[0];
  if (!me || !leaderRow) return { status: "no-data" as const, message: "No team has a rating yet." };
  const formula = a.rules.ranking_formula;
  const leader = a.byId[leaderRow.teamId];
  const chasers = lb
    .filter((r) => r.teamId !== leaderRow.teamId)
    .slice(0, 5)
    .map((r) => ({ team: a.byId[r.teamId], gap: round2((leaderRow.officialValue as number) - (r.officialValue as number)) }));
  if (leaderRow.teamId === myTeamId) {
    const second = chasers[0];
    return { status: "leading" as const, leader, chasers, message: second ? `You lead by ${second.gap} over ${second.team.team.name}.` : "You lead." };
  }
  const myVal = me.official;
  const gap = myVal === null ? null : round2((leaderRow.officialValue as number) - myVal);
  const scale = a.rules.rating_scale_max;
  const plans: { players: number; requiredAvg: number }[] = [];
  if (formula === "average") {
    // keep the leader's projection in mind: they will add players too
    const target = Math.max(leader.rating.average ?? 0, leader.projectedAverage ?? 0);
    for (let k = 1; k <= me.rules.slotsRemaining; k++) {
      const x = (target * (me.rating.ratedCount + k) - me.rating.total) / k + 0.01;
      if (x <= scale) plans.push({ players: k, requiredAvg: round2(Math.max(0, x)) });
    }
  } else if (formula === "total" && gap !== null) {
    for (let k = 1; k <= me.rules.slotsRemaining; k++) {
      const x = (gap + 0.01) / k;
      if (x <= scale) plans.push({ players: k, requiredAvg: round2(x) });
    }
  }
  const best = plans[0];
  const candidates = best
    ? a.market.available
        .filter((p) => (p.overall ?? 0) >= best.requiredAvg && cellAllowed(a.rules, me.rules.cellCounts, cellOf(p), me.rules.size).ok)
        .sort((x, y) => (y.overall ?? 0) - (x.overall ?? 0))
        .slice(0, 5)
    : [];
  return {
    status: "chasing" as const,
    leader,
    chasers,
    gap,
    plans,
    candidates,
    message: best
      ? `To overtake ${leader.team.name} (${formula === "average" ? "allowing for its projected average" : "on total rating"}), your next ${best.players} player(s) need to average at least ${best.requiredAvg}.`
      : `Overtaking ${leader.team.name} is not possible with your remaining ${me.rules.slotsRemaining} slot(s) on a ${scale}-point scale under the "${formula}" formula.`,
  };
}

// ---------------------------------------------------------------------------
// Rating improvement optimiser
// ---------------------------------------------------------------------------
export function ratingOptimizer(a: EventAnalysis, myTeamId: string) {
  const me = a.byId[myTeamId];
  const pool = rated(a.market.available).filter((p) => cellAllowed(a.rules, me.rules.cellCounts, cellOf(p), me.rules.size).ok);
  const price = (p: Player) => {
    const c = cellOf(p);
    return Math.max(Number(p.base_price) || 0, c ? a.market.expectedPrice[c] : a.market.globalFloor);
  };
  const budget = me.purseKnown ? me.maxSingleBid : Infinity;
  const n = me.rating.ratedCount;
  const avgAfter = (ps: Player[]) => round2((me.rating.total + ps.reduce((s, p) => s + (p.overall as number), 0)) / (n + ps.length));
  const singles = pool
    .filter((p) => price(p) <= budget)
    .map((p) => ({ players: [p], avg: avgAfter([p]), cost: round2(price(p)) }))
    .sort((x, y) => y.avg - x.avg || x.cost - y.cost)
    .slice(0, 5);
  const pairs: { players: Player[]; avg: number; cost: number }[] = [];
  if (me.rules.slotsRemaining >= 2) {
    const top = pool.slice().sort((x, y) => (y.overall as number) - (x.overall as number)).slice(0, 25);
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++) {
        const cost = price(top[i]) + price(top[j]);
        if (me.purseKnown && cost > me.remaining - Math.max(0, me.floorReserve - 2 * a.market.globalFloor)) continue;
        pairs.push({ players: [top[i], top[j]], avg: avgAfter([top[i], top[j]]), cost: round2(cost) });
      }
    pairs.sort((x, y) => y.avg - x.avg || x.cost - y.cost);
  }
  return {
    current: me.rating.average,
    singles,
    pairs: pairs.slice(0, 3),
    poolSize: pool.length,
    note: pool.length
      ? `Prices are estimates (base price or the median winning price for that role${a.market.soldCount < 3 ? "; few sales recorded yet" : ""}).`
      : "No unsold rated players have been recorded yet. Use Smart Bid with the player on the block to test a purchase.",
  };
}

// ---------------------------------------------------------------------------
// Purchase regret simulator
// ---------------------------------------------------------------------------
export function purchaseRegret(a: EventAnalysis, myTeamId: string, player: Player, price: number) {
  const me = a.byId[myTeamId];
  const after = analyseTeam(a.rules, me.team, [...me.entries, { player, price, source: "estimated" }], a.market, me.purseKnown ? me.initialPurse : undefined);
  const allowed = cellAllowed(a.rules, me.rules.cellCounts, cellOf(player), me.rules.size);
  const flexBefore = me.purseKnown ? me.maxSingleBid : null;
  const flexAfter = after.purseKnown ? after.maxSingleBid : null;
  return {
    allowed,
    before: me,
    after,
    nextBidBefore: flexBefore,
    nextBidAfter: flexAfter,
    flexibilityLoss: flexBefore && flexAfter !== null && flexBefore > 0 ? round2(1 - flexAfter / flexBefore) : null,
    completionPossible: after.purseSufficient && after.rules.feasible && !after.rules.hasViolation,
    avgChange: me.rating.average !== null && after.rating.average !== null ? round2(after.rating.average - me.rating.average) : after.rating.average,
    perSlotAfter: after.purseKnown && after.rules.slotsRequired > 0 ? round2(after.remaining / after.rules.slotsRequired) : null,
  };
}

// ---------------------------------------------------------------------------
// Scarcity detector (only when enough role data exists)
// ---------------------------------------------------------------------------
export function scarcity(a: EventAnalysis) {
  const enough = a.market.categoryCoverage >= 0.6 && a.market.enteredCount >= 10;
  if (!enough)
    return {
      reliable: false,
      reason: `Needs at least 10 recorded players with roles for ≥60% of them (currently ${a.market.enteredCount} players, ${Math.round(a.market.categoryCoverage * 100)}% with roles).`,
      cells: [] as { cell: Cell; supply: number; demand: number; teams: number; ratio: number; level: "critical" | "high" | "ok" }[],
    };
  const cells = ALL_CELLS.filter((c) => a.market.demand[c] > 0)
    .map((cell) => {
      const supply = a.market.supply[cell];
      const demand = a.market.demand[cell];
      const ratio = supply ? demand / supply : Infinity;
      return { cell, supply, demand, teams: a.market.demandTeams[cell], ratio: Number.isFinite(ratio) ? round2(ratio) : 99, level: (ratio > 1 ? "critical" : ratio >= 0.6 ? "high" : "ok") as "critical" | "high" | "ok" };
    })
    .sort((x, y) => y.ratio - x.ratio);
  return { reliable: true, reason: "Supply = unsold players recorded so far; future players not yet entered are unknown.", cells };
}

// ---------------------------------------------------------------------------
// Preset squad scenarios (from the recorded pool) for the what-if simulator
// ---------------------------------------------------------------------------
export type PresetKind = "best" | "conservative" | "batting" | "bowling" | "balanced";
export const PRESET_LABEL: Record<PresetKind, string> = {
  best: "Best possible squad",
  conservative: "Conservative squad",
  batting: "Strongest batting",
  bowling: "Strongest bowling",
  balanced: "Balanced squad",
};

export function presetScenario(a: EventAnalysis, myTeamId: string, kind: PresetKind) {
  const me = a.byId[myTeamId];
  const pricing = (p: Player) => {
    const c = cellOf(p);
    const est = Math.max(Number(p.base_price) || 0, c ? (kind === "conservative" ? a.market.floorPrice[c] : a.market.expectedPrice[c]) : a.market.globalFloor);
    return round2(est);
  };
  const score = (p: Player) => {
    const o = p.overall ?? 0;
    if (kind === "batting") return (p.category === "BAT" || p.category === "WK" || p.category === "AR" ? 2 : 0) + (p.batting ?? o) / 10;
    if (kind === "bowling") return (p.category === "BOWL" || p.category === "AR" ? 2 : 0) + (p.bowling ?? o) / 10;
    if (kind === "conservative") return o / Math.max(pricing(p), 0.01);
    return o;
  };
  let entries = [...me.entries];
  const picks: { player: Player; price: number }[] = [];
  let budget = me.purseKnown ? me.remaining : Infinity;
  const pool = rated(a.market.available);
  const target = Math.min(a.rules.squad_max, Math.max(a.rules.squad_min, me.rating.count));
  for (let guard = 0; guard < 60 && entries.length < target; guard++) {
    const cur = analyseTeam(a.rules, me.team, entries, a.market, me.purseKnown ? me.initialPurse : undefined);
    const needCells = new Set(cur.rules.mandatoryPlan);
    const candidates = pool
      .filter((p) => !picks.some((x) => x.player.id === p.id))
      .filter((p) => cellAllowed(a.rules, cur.rules.cellCounts, cellOf(p), cur.rules.size).ok)
      .filter((p) => {
        const after = analyseTeam(a.rules, me.team, [...entries, { player: p, price: pricing(p), source: "estimated" }], a.market, me.purseKnown ? me.initialPurse : undefined);
        return after.rules.feasible && (!me.purseKnown || budget - pricing(p) >= completionPlan(a.rules, after.rules, a.market, "floor").cost);
      })
      .sort((x, y) => {
        const nx = cellOf(x) && needCells.has(cellOf(x) as Cell) ? 1 : 0;
        const ny = cellOf(y) && needCells.has(cellOf(y) as Cell) ? 1 : 0;
        if (kind === "balanced" && nx !== ny) return ny - nx;
        return score(y) - score(x);
      });
    const p = candidates[0];
    if (!p) break;
    const price = pricing(p);
    picks.push({ player: p, price });
    entries = [...entries, { player: p, price, source: "estimated" }];
    budget -= price;
  }
  return { picks, note: pool.length ? "Built only from unsold players recorded so far, at estimated prices." : "No unsold rated players recorded yet." };
}

