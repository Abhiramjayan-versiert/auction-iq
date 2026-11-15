// Auction Co-Pilot — answers natural-language questions with numbers from the
// deterministic engine. No language model is required: every answer is computed,
// and every answer carries its reasoning, confidence and data limitations.
import type { EventAnalysis, TeamAnalysis } from "./analysis";
import { FLOOR_SOURCE_LABEL } from "./analysis";
import { fmtMoney, fmtRating, round2 } from "./money";
import type { Confidence } from "./predictions";
import { predictCompetitor } from "./predictions";
import { cellLabel } from "./rules";
import { smartBid } from "./smartBid";
import { AGGRESSION_CAVEAT, AGGRESSION_LABEL, aggressionIndex, financialIntel, leaderHunter, ratingOptimizer, scarcity, weaknessScan } from "./intel";
import type { Player, Strategy } from "./types";

export interface CopilotAnswer {
  topic: string;
  answer: string;
  reasoning: string[];
  confidence: Confidence;
  limitations: string[];
  kind: "calculated" | "estimate" | "prediction" | "help";
}

export const SUGGESTED_QUESTIONS = [
  "Which team is currently strongest?",
  "Which competitor has the highest purse?",
  "How much can Mumbai afford?",
  "What is my team's biggest weakness?",
  "What is my maximum safe bid?",
  "Which player will improve my average rating most?",
  "Can I complete my squad with my remaining purse?",
  "How can I overtake the current leader?",
  "Which teams are spending aggressively?",
  "What should my next three purchases focus on?",
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

function findTeam(a: EventAnalysis, q: string, exclude?: string): TeamAnalysis | null {
  const nq = ` ${norm(q)} `;
  let best: TeamAnalysis | null = null;
  let bestLen = 0;
  for (const t of a.teams) {
    if (t.team.id === exclude) continue;
    for (const n of [t.team.name, t.team.short_name].filter(Boolean) as string[]) {
      const k = norm(n).trim();
      if (k.length >= 2 && nq.includes(` ${k} `) && k.length > bestLen) {
        best = t;
        bestLen = k.length;
      }
      // first word match (e.g. "Mumbai" for "Mumbai Indians")
      const first = k.split(" ")[0];
      if (first.length >= 4 && nq.includes(` ${first} `) && first.length > bestLen) {
        best = t;
        bestLen = first.length;
      }
    }
  }
  return best;
}

function findPlayer(players: Player[], q: string): Player | null {
  const nq = ` ${norm(q)} `;
  return players.filter((p) => p.name.length >= 3 && nq.includes(` ${norm(p.name).trim()} `)).sort((x, y) => y.name.length - x.name.length)[0] ?? null;
}

export function askCopilot(
  question: string,
  ctx: { a: EventAnalysis; myTeamId: string | null; strategy: Strategy; players: Player[] },
): CopilotAnswer {
  const { a, myTeamId, strategy, players } = ctx;
  const q = norm(question);
  const unit = a.rules.currency;
  const m = (n: number | null | undefined) => fmtMoney(n, unit);
  const me = myTeamId ? a.byId[myTeamId] : null;
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  const needTeam = (): CopilotAnswer => ({
    topic: "Your team",
    answer: "I need to know your team first — select or claim a team in this event.",
    reasoning: [],
    confidence: "high",
    limitations: [],
    kind: "help",
  });
  const otherTeam = findTeam(a, question, myTeamId ?? undefined);
  const player = findPlayer(players, question);

  // maximum bid / should I spend on <player>
  if (has("safe bid", "max bid", "maximum bid", "should i spend", "should i bid", "how much should i", "worth bidding", "bid for", "bid on")) {
    if (!me) return needTeam();
    if (!me.purseKnown) return { topic: "Bid limit", answer: "Your initial purse hasn't been set, so I can't compute a safe bid yet.", reasoning: [], confidence: "high", limitations: ["Initial purse missing."], kind: "help" };
    if (!player) {
      return {
        topic: "Maximum safe bid",
        answer: `Your largest safe bid on any single player right now is ${m(me.maxSingleBid)} — that still leaves ${m(me.floorReserve)} to complete your squad.`,
        reasoning: [
          `Remaining purse ${m(me.remaining)}.`,
          `Minimum cost to complete your squad: ${m(me.floorReserve)}${me.completion.provisional ? " (provisional)" : ""}, using the ${FLOOR_SOURCE_LABEL[a.market.floorSource]}.`,
          `${me.rules.slotsRequired} player(s) still required.`,
          "Name a player (e.g. “should I bid on <player name>?”) or use Smart Bid with the player on the block for a strategy-specific number.",
        ],
        confidence: a.market.floorSource === "none" ? "low" : "high",
        limitations: a.market.floorSource === "none" ? ["No price information recorded yet, so reserves are zero."] : [],
        kind: "calculated",
      };
    }
    const r = smartBid(a, me.team.id, player, strategy);
    return {
      topic: `Smart Bid · ${player.name}`,
      answer: r.eligible
        ? `Suggested ${strategy} bid for ${player.name}: up to ${m(r.maxBid)} (absolute safe maximum ${m(r.maxSafeBid)}). Risk: ${r.risk}.`
        : `Don't bid on ${player.name}: ${r.blockedReason ?? "your free budget is below the player's price."}`,
      reasoning: r.reasoning,
      confidence: r.limitations.length ? "low" : "medium",
      limitations: r.limitations,
      kind: "estimate",
    };
  }

  // competitor affordability
  if (has("afford", "can spend", "how much can", "how much money does", "budget of")) {
    const t = otherTeam ?? (has("my", " i ") ? me : null);
    if (!t) return { topic: "Affordability", answer: "Which team? Try “How much can <team name> afford?”.", reasoning: [], confidence: "high", limitations: [], kind: "help" };
    if (!t.purseKnown) return { topic: `${t.team.name} affordability`, answer: `${t.team.name}'s initial purse hasn't been set, so its budget is unknown.`, reasoning: [], confidence: "high", limitations: ["Initial purse missing."], kind: "help" };
    return {
      topic: `${t.team.name} affordability`,
      answer: `${t.team.name} could bid up to about ${m(t.maxSingleBid)} on one player and still complete its squad (estimate). Its purse is ${m(t.remaining)}.`,
      reasoning: [
        `Remaining purse ${m(t.remaining)} (official).`,
        `Estimated minimum to complete its squad: ${m(t.floorReserve)} for ${t.rules.slotsRequired} required player(s).`,
        `Estimated available budget = ${m(t.remaining)} − reserve for its other required slots = ${m(t.maxSingleBid)}.`,
        "This is a ceiling — a team rarely spends all of it on one player.",
      ],
      confidence: t.completion.provisional ? "low" : "medium",
      limitations: t.completion.provisional ? ["Too few prices recorded to price every remaining slot."] : [],
      kind: "estimate",
    };
  }

  // predict competitor
  if (otherTeam && has("target", "next", "predict", "likely", "plan", "going to", "want")) {
    const p = predictCompetitor(a, otherTeam);
    const n = p.likelyNext[0];
    return {
      topic: `${otherTeam.team.name} · next move`,
      answer: n ? `${p.summary} (confidence: ${n.confidence}). This is an estimate, not a confirmed intention.` : p.summary,
      reasoning: n ? n.evidence : [`${otherTeam.rules.slotsRequired} required slots, ${m(otherTeam.remaining)} purse.`],
      confidence: n?.confidence ?? "low",
      limitations: a.market.categoryCoverage < 0.5 ? ["Few players have a recorded role, so category predictions are weak."] : [],
      kind: "prediction",
    };
  }

  // strongest / leader
  if (has("strongest", "leader", "leading", "top team", "best team", "winning", "first place", "rank") && !has("overtake", "beat", "catch")) {
    const lb = a.leaderboard;
    const top = lb[0] ? a.byId[lb[0].teamId] : null;
    if (!top || top.official === null) return { topic: "Leaderboard", answer: "No ratings recorded yet.", reasoning: [], confidence: "high", limitations: [], kind: "calculated" };
    const myRow = me ? lb.find((r) => r.teamId === me.team.id) : null;
    return {
      topic: "Strongest team",
      answer: `${top.team.name} leads the official ranking with ${fmtRating(top.official)} (${a.rules.ranking_formula}).${myRow ? ` You are #${myRow.officialRank}.` : ""}`,
      reasoning: [
        ...lb.slice(0, 5).map((r) => `#${r.officialRank} ${a.byId[r.teamId].team.name}: ${fmtRating(r.officialValue)} from ${a.byId[r.teamId].rating.ratedCount} rated player(s)${r.eligible ? "" : " — not yet eligible"}`),
        "Rankings are provisional until the auction is completed.",
      ],
      confidence: "high",
      limitations: [],
      kind: "calculated",
    };
  }

  // purse leaders
  if (has("highest purse", "most money", "richest", "most purse", "biggest purse", "lowest purse", "least money", "poorest")) {
    const fi = financialIntel(a);
    const low = has("lowest", "least", "poorest");
    const list = low ? fi.lowestPurse : fi.highestPurse;
    if (!list.length) return { topic: "Purses", answer: "No team has a purse set yet.", reasoning: [], confidence: "high", limitations: [], kind: "help" };
    return {
      topic: low ? "Lowest purses" : "Highest purses",
      answer: `${list[0].team.name} has the ${low ? "lowest" : "highest"} remaining purse: ${m(list[0].remaining)}.`,
      reasoning: list.map((t) => `${t.team.name}: ${m(t.remaining)} left, can bid ~${m(t.maxSingleBid)} on one player (estimate), needs ${t.rules.slotsRequired}.`),
      confidence: "high",
      limitations: fi.unknownPurse.length ? [`${fi.unknownPurse.length} team(s) have no purse set and are excluded.`] : [],
      kind: "calculated",
    };
  }

  // weakness
  if (has("weakness", "weak", "problem", "wrong with")) {
    if (!me) return needTeam();
    const ws = weaknessScan(a, me.team.id);
    return {
      topic: "Your biggest weakness",
      answer: ws.length ? `${ws[0].title}: ${ws[0].detected}` : "No clear weakness detected from the recorded data.",
      reasoning: ws.length ? ws.map((w) => `${w.title} — ${w.why} ${w.improve}`) : ["Checked squad requirements, purse, ratings vs other teams and spending efficiency."],
      confidence: ws[0]?.confidence ?? "medium",
      limitations: a.market.categoryCoverage < 0.5 ? ["Batting/bowling comparisons need player roles to be recorded."] : [],
      kind: "calculated",
    };
  }

  // improve average
  if (has("improve", "increase my average", "boost", "raise my")) {
    if (!me) return needTeam();
    const o = ratingOptimizer(a, me.team.id);
    const s = o.singles[0];
    const p2 = o.pairs[0];
    return {
      topic: "Rating improvement",
      answer: s ? `${s.players[0].name} (${s.players[0].overall}) would lift your average from ${fmtRating(o.current)} to ${fmtRating(s.avg)} at an estimated ${m(s.cost)}.` : o.note,
      reasoning: [...o.singles.slice(1, 4).map((x) => `${x.players[0].name}: average → ${fmtRating(x.avg)} (~${m(x.cost)})`), ...(p2 ? [`Best pair: ${p2.players.map((p) => p.name).join(" + ")} → ${fmtRating(p2.avg)} (~${m(p2.cost)})`] : [])],
      confidence: s ? "medium" : "low",
      limitations: [o.note],
      kind: "estimate",
    };
  }

  // squad completion
  if (has("complete my squad", "complete the squad", "finish my squad", "enough money", "can i complete", "squad completion")) {
    if (!me) return needTeam();
    if (!me.purseKnown) return { topic: "Squad completion", answer: "Your initial purse isn't set, so I can't check affordability.", reasoning: [], confidence: "high", limitations: [], kind: "help" };
    const ok = me.purseSufficient && me.rules.feasible;
    return {
      topic: "Squad completion",
      answer: ok
        ? `Yes. You need ${me.rules.slotsRequired} more player(s); the minimum estimated cost is ${m(me.floorReserve)} and you have ${m(me.remaining)} (${m(me.discretionary)} to spare).`
        : !me.rules.feasible
          ? "No — your remaining slots can no longer satisfy every squad rule."
          : `At risk — the minimum estimated cost (${m(me.floorReserve)}) exceeds your purse (${m(me.remaining)}).`,
      reasoning: [
        `Required slots: ${me.completion.slots.map((s) => (s === "ANY" ? "any role" : cellLabel(s))).join(", ") || "none"}.`,
        "Cost found by searching for the cheapest combination of distinct players that satisfies every rule (not just cheapest price × slots).",
        `Prices from the ${FLOOR_SOURCE_LABEL[a.market.floorSource]}.`,
      ],
      confidence: me.completion.provisional ? "low" : "high",
      limitations: me.completion.provisional ? ["Provisional: not enough unsold players recorded to price every slot."] : [],
      kind: "calculated",
    };
  }

  // overtake leader
  if (has("overtake", "beat", "catch", "catch up", "pass the")) {
    if (!me) return needTeam();
    const h = leaderHunter(a, me.team.id);
    return {
      topic: "Leader Hunter",
      answer: h.message,
      reasoning: h.status === "chasing" ? [...h.plans.slice(0, 4).map((p) => `${p.players} player(s) averaging ≥ ${p.requiredAvg}`), ...(h.candidates.length ? [`Recorded candidates: ${h.candidates.map((p) => `${p.name} (${p.overall})`).join(", ")}`] : [])] : [],
      confidence: "medium",
      limitations: ["Assumes the leader's projected average; the leader may also improve."],
      kind: "estimate",
    };
  }

  // aggression
  if (has("aggressive", "spending fast", "overspend", "conservative", "spending")) {
    const ag = aggressionIndex(a).filter((x) => x.cls).sort((x, y) => (y.index ?? 0) - (x.index ?? 0));
    const hot = ag.filter((x) => x.cls === "aggressive" || x.cls === "highly_aggressive");
    return {
      topic: "Spending behaviour",
      answer: hot.length ? `Most aggressive: ${hot.slice(0, 3).map((x) => `${x.teamName} (${AGGRESSION_LABEL[x.cls!]}, ${x.index}× going rate)`).join(", ")}.` : ag.length ? "No team is clearly overpaying yet." : "Not enough purchases recorded to judge spending behaviour.",
      reasoning: ag.slice(0, 6).map((x) => `${x.teamName}: ${x.index}× (${x.purchases} purchases, ${x.basis})`),
      confidence: "low",
      limitations: [AGGRESSION_CAVEAT],
      kind: "estimate",
    };
  }

  // next purchases
  if (has("next three", "next 3", "next purchases", "focus", "priorit", "what should i buy", "what next")) {
    if (!me) return needTeam();
    const needs = [...new Set(me.rules.mandatoryPlan)];
    const ruleNeeds = me.rules.statuses.filter((s) => s.state === "incomplete").map((s) => `${s.need} more ${s.constraint.label.toLowerCase()}`);
    const sc = scarcity(a);
    const opt = ratingOptimizer(a, me.team.id);
    const reasons: string[] = [];
    if (ruleNeeds.length) reasons.push(`Rules still require: ${ruleNeeds.join(", ")}.`);
    else if (me.rules.flexSlots) reasons.push(`${me.rules.flexSlots} more player(s) of any role to reach the minimum squad.`);
    if (sc.reliable) sc.cells.filter((c) => needs.includes(c.cell) && c.level !== "ok").forEach((c) => reasons.push(`${cellLabel(c.cell)}s look scarce: ${c.supply} unsold recorded vs ${c.demand} still required across ${c.teams} teams (future entries unknown).`));
    if (opt.singles[0]) reasons.push(`Best rating boost recorded: ${opt.singles[0].players[0].name} (${opt.singles[0].players[0].overall}).`);
    if (me.purseKnown) reasons.push(`Keep each bid under ~${m(me.maxSingleBid)} to stay able to complete the squad.`);
    return {
      topic: "Next purchases",
      answer: ruleNeeds.length
        ? `Focus on ${ruleNeeds.slice(0, 3).join(", then ")} — required by the event rules.`
        : me.rules.slotsRequired
          ? `Fill ${me.rules.slotsRequired} more slot(s) with the highest-rated players you can afford.`
          : "All rule requirements are met — target the highest-rated players you can afford.",
      reasoning: reasons,
      confidence: ruleNeeds.length ? "high" : "medium",
      limitations: sc.reliable ? [] : [sc.reason],
      kind: "estimate",
    };
  }

  // my team status
  if (me && has("my team", "my purse", "how am i", "status", "summary")) {
    return {
      topic: me.team.name,
      answer: `${me.rating.count} players, average ${fmtRating(me.rating.average)} (${me.rating.ratedCount} rated), ${me.purseKnown ? `${m(me.remaining)} left` : "purse not set"}, ${me.rules.slotsRequired} required.`,
      reasoning: me.rules.alerts.filter((x) => x.level !== "info").map((x) => x.message),
      confidence: "high",
      limitations: [],
      kind: "calculated",
    };
  }

  return {
    topic: "Try asking",
    answer: "I answer from the live auction data. Try one of these questions:",
    reasoning: SUGGESTED_QUESTIONS,
    confidence: "high",
    limitations: [],
    kind: "help",
  };
}

export const COPILOT_DISCLAIMER = "Answers are computed by AUCTION IQ's deterministic engine from recorded data. Predictions are estimates, never knowledge of other teams' intentions.";
export const roundTo = round2;
