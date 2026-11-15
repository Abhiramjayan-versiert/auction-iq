import type { EventAnalysis } from "./analysis";
import { mean, round2 } from "./money";
import type { Confidence } from "./predictions";
import { cellAllowed, cellLabel, cellOf } from "./rules";
import { scarcity, weaknessScan } from "./intel";

export type InsightSeverity = "critical" | "warning" | "opportunity" | "info";
export type InsightTopic = "own_rules" | "purse" | "strength" | "competitor" | "opportunity" | "priority";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  topic: InsightTopic;
  title: string;
  detected: string;
  why: string;
  action: string;
  impact: string;
  confidence: Confidence;
  calculation: string;
}

/**
 * Deterministic recommendation engine. Every insight references concrete
 * numbers from the current auction state — no generic advice.
 */
export function generateInsights(a: EventAnalysis, myTeamId: string): Insight[] {
  const me = a.byId[myTeamId];
  if (!me) return [];
  const unit = a.rules.currency;
  const out: Insight[] = [];
  const others = a.teams.filter((t) => t.team.id !== myTeamId);
  const name = (id: string) => a.byId[id].team.short_name || a.byId[id].team.name;

  // 1. Own violations / incomplete / purse
  for (const al of me.rules.alerts) {
    if (al.level === "red") {
      out.push({
        id: `own-${al.message}`,
        severity: "critical",
        topic: "own_rules",
        title: "Rule violation on your squad",
        detected: al.message,
        why: "Teams with rule violations are not eligible for the official ranking.",
        action: "Ask the auctioneer to verify the record, and avoid any further players in this category.",
        impact: "Restores eligibility for the official ranking.",
        confidence: "high",
        calculation: me.rules.statuses.map((s) => `${s.constraint.label}: ${s.count}`).join(" · "),
      });
    }
  }
  if (!me.purseKnown) {
    out.push({
      id: "own-purse-unknown",
      severity: "info",
      topic: "purse",
      title: "Your initial purse isn't set",
      detected: "The organiser hasn't entered your team's starting purse.",
      why: "Remaining purse, reserves, Smart Bid and purse alerts need it.",
      action: "Ask the organiser or data-entry operator to set it (or enter your own estimate in the purse calculator).",
      impact: "Unlocks every purse-based recommendation.",
      confidence: "high",
      calculation: "initial purse = not set",
    });
  } else if (!me.purseSufficient) {
    out.push({
      id: "own-purse",
      severity: "critical",
      topic: "purse",
      title: "Purse cannot complete the mandatory squad",
      detected: `Remaining ${me.remaining} ${unit}, but ${me.rules.slotsRequired} mandatory slot(s) need at least ${me.floorReserve} ${unit}.`,
      why: "An incomplete squad may be ineligible to win.",
      action: "Only bid base price on players that fill mandatory slots from now on.",
      impact: `Shortfall of ${round2(me.floorReserve - me.remaining)} ${unit}.`,
      confidence: "high",
      calculation: `floor reserve = Σ cheapest base price per mandatory slot = ${me.floorReserve}`,
    });
  } else if (me.rules.slotsRequired > 0 && me.floorReserve > 0 && me.discretionary < me.floorReserve * 0.25) {
    out.push({
      id: "own-purse-tight",
      severity: "warning",
      topic: "purse",
      title: "Purse is getting tight",
      detected: `Only ${me.discretionary} ${unit} free after reserving ${me.floorReserve} ${unit} for ${me.rules.slotsRequired} mandatory slot(s).`,
      why: "Overbidding on one player now will force base-price picks later.",
      action: `Cap any single bid at about ${round2(me.discretionary + (me.rules.mandatoryPlan[0] ? a.market.floorPrice[me.rules.mandatoryPlan[0]] : 0))} ${unit}.`,
      impact: "Keeps the squad completable.",
      confidence: "high",
      calculation: `${me.remaining} − ${me.floorReserve} = ${me.discretionary}`,
    });
  }

  // 2. Strength vs leaders
  const leaders = a.leaderboard.slice(0, 3).map((r) => a.byId[r.teamId]).filter((t) => t.team.id !== myTeamId && t.rating.count > 0);
  for (const dim of ["batting", "bowling"] as const) {
    const mine = me.rating[dim];
    const lead = mean(leaders.map((t) => t.rating[dim]).filter((x): x is number => x !== null));
    if (mine !== null && lead !== null && lead - mine > 0.25) {
      const other = dim === "batting" ? "bowling" : "batting";
      const otherMine = me.rating[other];
      out.push({
        id: `strength-${dim}`,
        severity: "warning",
        topic: "strength",
        title: `${dim === "batting" ? "Batting" : "Bowling"} is behind the leaders`,
        detected: `Your ${dim} average is ${mine.toFixed(2)} vs ${lead.toFixed(2)} for the top ${leaders.length} team(s).${
          otherMine !== null ? ` Your ${other} average is ${otherMine.toFixed(2)}.` : ""
        }`,
        why: "The gap will show in weighted analytical strength and limits your average upside.",
        action: `Prioritise high-rated ${dim === "batting" ? "batsmen / wicketkeepers" : "bowlers / all-rounders"} among remaining picks.`,
        impact: `Closing the gap of ${round2(lead - mine)} rating points.`,
        confidence: "medium",
        calculation: `leaders: ${leaders.map((t) => `${name(t.team.id)} ${t.rating[dim]?.toFixed(2) ?? "—"}`).join(", ")}`,
      });
    }
  }

  // 3. Competitor pressure
  for (const t of others) {
    if (!t.purseKnown) continue;
    if (t.utilization >= 0.7 && t.rules.slotsRequired >= 2) {
      out.push({
        id: `comp-pressure-${t.team.id}`,
        severity: "opportunity",
        topic: "competitor",
        title: `${name(t.team.id)} is under spending pressure`,
        detected: `${name(t.team.id)} has spent ${Math.round(t.utilization * 100)}% of its purse and still needs ${t.rules.slotsRequired} player(s)${
          t.rules.mandatoryPlan.length ? ` (${[...new Set(t.rules.mandatoryPlan)].map(cellLabel).join(", ")})` : ""
        }.`,
        why: `It can bid at most ${t.maxSingleBid} ${unit} on any single player.`,
        action: `Expect ${name(t.team.id)} to drop out of bidding above ${t.maxSingleBid} ${unit}.`,
        impact: "Less competition for players in its needed categories.",
        confidence: "high",
        calculation: `${t.remaining} remaining − ${round2(t.floorReserve - (t.rules.mandatoryPlan[0] ? a.market.floorPrice[t.rules.mandatoryPlan[0]] : 0))} reserve for other slots`,
      });
    } else if (!t.purseSufficient) {
      out.push({
        id: `comp-broke-${t.team.id}`,
        severity: "opportunity",
        topic: "competitor",
        title: `${name(t.team.id)} cannot complete its squad`,
        detected: `${name(t.team.id)} has only ${t.remaining} ${unit} left for ${t.rules.slotsRequired} mandatory position(s) (needs ${t.floorReserve}).`,
        why: "It is unlikely to be officially eligible and is effectively out of the bidding.",
        action: "Discount this team when estimating competition for remaining players.",
        impact: "One fewer bidder.",
        confidence: "high",
        calculation: `${t.remaining} < ${t.floorReserve}`,
      });
    }
  }

  // 4. Best improvement opportunity
  if (me.rules.slotsRemaining > 0) {
    const fitting = a.market.available
      .filter((p) => p.overall !== null && cellAllowed(a.rules, me.rules.cellCounts, cellOf(p), me.rules.size).ok)
      .filter((p) => {
        const c = cellOf(p);
        return !me.purseKnown || Number(p.base_price) <= me.discretionary + (c ? a.market.floorPrice[c] : a.market.globalFloor);
      })
      .map((p) => {
        const n = me.rating.ratedCount;
        const newAvg = (me.rating.total + (p.overall as number)) / (n + 1);
        const c = cellOf(p);
        return { p, newAvg, fills: c !== null && me.rules.mandatoryPlan.includes(c) };
      })
      .sort((x, y) => Number(y.fills) - Number(x.fills) || y.newAvg - x.newAvg);
    const best = fitting[0];
    if (best) {
      out.push({
        id: `opp-${best.p.id}`,
        severity: "opportunity",
        topic: "opportunity",
        title: `Target: ${best.p.name}`,
        detected: `${best.p.name} (${cellLabel(cellOf(best.p))}, rating ${best.p.overall}) is available at base ${best.p.base_price} ${unit}.`,
        why: me.rating.average !== null
          ? `May improve your average from ${me.rating.average.toFixed(2)} to ${best.newAvg.toFixed(2)}${best.fills ? " and fills a mandatory slot" : ""}.`
          : `Would start your squad at ${best.newAvg.toFixed(2)}${best.fills ? " and fills a mandatory slot" : ""}.`,
        action: "Open Smart Bid for this player to get your bid ceiling.",
        impact: `${me.rating.average !== null ? `+${round2(best.newAvg - me.rating.average)}` : best.newAvg.toFixed(2)} average rating.`,
        confidence: best.fills ? "high" : "medium",
        calculation: `(${me.rating.total} + ${best.p.overall}) ÷ ${me.rating.ratedCount + 1} = ${best.newAvg.toFixed(2)}`,
      });
    }
  }

  // 5. Budget flexibility
  if (others.length && me.purseKnown) {
    const weaker = others.filter((t) => t.purseKnown && t.discretionary < me.discretionary).length;
    if (weaker > 0) {
      out.push({
        id: "flex",
        severity: "info",
        topic: "purse",
        title: "Budget flexibility",
        detected: `Your team has more free budget than ${weaker} of ${others.length} competing team(s).`,
        why: "Free budget after mandatory reserves decides who can win contested players.",
        action: weaker / others.length > 0.6 ? "You can afford to compete hard for one or two premium players." : "Pick your battles; several teams can outbid you.",
        impact: `Free budget ${me.discretionary} ${unit}.`,
        confidence: "high",
        calculation: `discretionary = remaining − floor reserve = ${me.remaining} − ${me.floorReserve}`,
      });
    }
  }

  // 6. Priority: scarce categories first
  const myCells = scarcity(a).reliable ? [...new Set(me.rules.mandatoryPlan)] : [];
  const scarce = myCells
    .map((c) => ({ c, supply: a.market.supply[c], demand: a.market.demand[c], teams: a.market.demandTeams[c] }))
    .filter((x) => x.supply <= x.demand)
    .sort((x, y) => x.supply - x.demand - (y.supply - y.demand));
  if (scarce[0]) {
    const s = scarce[0];
    out.push({
      id: `prio-${s.c}`,
      severity: "warning",
      topic: "priority",
      title: `Prioritise: ${cellLabel(s.c).toLowerCase()}`,
      detected: `Only ${s.supply} unsold ${cellLabel(s.c).toLowerCase()}(s) have been recorded so far, while ${s.teams} team(s) still need ${s.demand} in total.`,
      why: "Scarce mandatory categories get expensive or run out before the auction ends (players not yet entered are unknown).",
      action: `Secure a ${cellLabel(s.c).toLowerCase()} before spending on discretionary players.`,
      impact: "Avoids an unfillable mandatory slot.",
      confidence: s.supply < s.demand ? "high" : "medium",
      calculation: `supply ${s.supply} vs required slots ${s.demand} (${s.teams} teams)`,
    });
  }

  // 7. Weakness scanner (only where the recorded data supports it)
  for (const w of weaknessScan(a, myTeamId)) {
    out.push({
      id: `weak-${w.kind}`,
      severity: w.severity,
      topic: "strength",
      title: w.title,
      detected: w.detected,
      why: w.why,
      action: w.improve,
      impact: w.impact,
      confidence: w.confidence,
      calculation: w.calculation,
    });
  }

  const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  return out.sort((x, y) => order[x.severity] - order[y.severity]);
}
