import { describe, expect, it } from "vitest";
import {
  aggressionIndex,
  analyseEvent,
  askCopilot,
  completionPlan,
  hypotheticalPlayer,
  leaderHunter,
  presetScenario,
  purchaseRegret,
  ratingOptimizer,
  runMonteCarlo,
  scarcity,
  shadowCompare,
  smartBid,
  weaknessScan,
  type Player,
} from "..";
import { exampleRules, mkPlayer, mkTeam, sale } from "./fixtures";

// A live-entry event: players exist only once the operator enters them; many lack role/origin.
const bare = (name: string, rating: number | null): Player => ({ id: name, name, origin: null, category: null, base_price: 0, overall: rating, auction_status: "available" });

describe("live entry with incomplete data", () => {
  const rules = { ...exampleRules(), constraints: [], squad_min: 5, squad_max: 7 };

  it("works with only name, rating, team and price", () => {
    const ps = [bare("A", 9), bare("B", 8), bare("C", null)];
    const txs = [sale(ps[0], "T1", 10), sale(ps[1], "T1", 5), sale(ps[2], "T2", 3)];
    const a = analyseEvent({ rules, teams: [mkTeam("T1"), mkTeam("T2")], players: ps, transactions: txs });
    expect(a.byId.T1.rating.average).toBe(8.5);
    expect(a.byId.T2.rating.average).toBeNull(); // unrated player is not counted as 0
    expect(a.byId.T2.rating.ratedCount).toBe(0);
    expect(a.byId.T2.rating.count).toBe(1);
    expect(a.market.ratingCoverage).toBeCloseTo(2 / 3);
    expect(a.market.categoryCoverage).toBe(0);
  });

  it("disables purse maths for a team without an initial purse", () => {
    const p = bare("A", 9);
    const team = { ...mkTeam("T1"), initial_purse: null };
    const a = analyseEvent({ rules, teams: [team, mkTeam("T2")], players: [p], transactions: [sale(p, "T1", 10)] });
    expect(a.byId.T1.purseKnown).toBe(false);
    expect(Number.isNaN(a.byId.T1.remaining)).toBe(true);
    expect(a.byId.T1.purseSufficient).toBe(true); // no false alarm
    const r = smartBid(a, "T1", hypotheticalPlayer({ rating: 8 }), "balanced");
    expect(r.eligible).toBe(false);
    expect(r.blockedReason).toMatch(/purse has not been set/);
  });

  it("reports missing information instead of guessing", () => {
    const a = analyseEvent({ rules: exampleRules(), teams: [mkTeam("T1"), mkTeam("T2")], players: [], transactions: [] });
    expect(a.market.floorSource).toBe("none");
    const r = smartBid(a, "T1", hypotheticalPlayer({ rating: null }), "balanced");
    expect(r.limitations.join(" ")).toMatch(/rating not recorded/i);
    expect(r.limitations.join(" ")).toMatch(/role\/origin not recorded/i);
    expect(r.limitations.join(" ")).toMatch(/no price information/i);
  });
});

describe("minimum squad completion cost (constrained optimisation)", () => {
  it("uses distinct players and respects overlapping rules, not cheapest × slots", () => {
    const rules = {
      ...exampleRules(),
      squad_min: 3,
      squad_max: 3,
      min_player_price: null,
      constraints: [
        { id: "wk", label: "Wicketkeepers", category: "WK" as const, origin: null, min: 1, max: null },
        { id: "os", label: "Overseas", category: null, origin: "overseas" as const, min: null, max: 1 },
        { id: "bowl", label: "Bowlers", category: "BOWL" as const, origin: null, min: 2, max: null },
      ],
    };
    const pool = [
      mkPlayer("WK", "overseas", 7, 1), // cheapest WK is overseas…
      mkPlayer("WK", "indian", 7, 4),
      mkPlayer("BOWL", "overseas", 7, 1), // …and so is the cheapest bowler; only one overseas allowed
      mkPlayer("BOWL", "indian", 7, 3),
      mkPlayer("BOWL", "indian", 7, 5),
    ];
    const a = analyseEvent({ rules, teams: [mkTeam("T")], players: pool, transactions: [] });
    const plan = a.byId.T.completion;
    // best legal combo: overseas WK (1) + Indian bowlers (3 + 5) = 9, or Indian WK (4) + overseas bowler (1) + Indian bowler (3) = 8
    expect(plan.cost).toBe(8);
    expect(plan.slots.filter((s) => s === "overseas:WK" || s === "overseas:BOWL").length).toBe(1);
    expect(plan.provisional).toBe(false);
    const naive = 3 * 1;
    expect(plan.cost).toBeGreaterThan(naive);
    expect(completionPlan(rules, a.byId.T.rules, a.market, "expected").cost).toBeGreaterThanOrEqual(plan.cost);
  });
});

describe("advanced intelligence", () => {
  const rules = { ...exampleRules(), constraints: [], squad_min: 4, squad_max: 5 };
  const build = () => {
    const ps: Player[] = [];
    const txs = [];
    const teams = ["A", "B", "C"].map((t) => mkTeam(t, 50));
    let i = 0;
    for (const t of ["A", "A", "B", "B", "C", "C"]) {
      const r = 7 + (i % 3);
      const p = mkPlayer(i % 2 ? "BAT" : "BOWL", "indian", r, 0);
      ps.push(p);
      txs.push(sale(p, t, t === "C" ? r * 2.5 : r * 1)); // C overpays
      i++;
    }
    for (let k = 0; k < 6; k++) ps.push(mkPlayer(k % 2 ? "BAT" : "AR", "indian", 7 + k * 0.4, 1));
    return analyseEvent({ rules, teams, players: ps, transactions: txs });
  };

  it("aggression index flags the overpaying team", () => {
    const ag = aggressionIndex(build());
    const c = ag.find((x) => x.teamId === "C")!;
    const a = ag.find((x) => x.teamId === "A")!;
    expect(c.index!).toBeGreaterThan(a.index!);
    expect(["aggressive", "highly_aggressive"]).toContain(c.cls);
  });

  it("leader hunter returns a concrete required average", () => {
    const a = build();
    const leader = a.leaderboard[0].teamId;
    const chaser = a.teams.find((t) => t.team.id !== leader)!.team.id;
    const h = leaderHunter(a, chaser);
    expect(["chasing", "leading"]).toContain(h.status);
    if (h.status === "chasing") expect(h.message).toMatch(/average at least|not possible/);
  });

  it("rating optimiser, regret, presets and scarcity behave", () => {
    const a = build();
    const o = ratingOptimizer(a, "A");
    expect(o.singles.length).toBeGreaterThan(0);
    expect(o.singles[0].avg).toBeGreaterThanOrEqual(o.singles[o.singles.length - 1].avg);
    const reg = purchaseRegret(a, "A", a.market.available[0], 30);
    expect(reg.nextBidAfter!).toBeLessThan(reg.nextBidBefore!);
    const pre = presetScenario(a, "A", "best");
    expect(pre.picks.length).toBeGreaterThan(0);
    expect(scarcity(a).reliable).toBe(true);
    expect(weaknessScan(a, "C").some((w) => w.kind === "efficiency")).toBe(true);
  });

  it("monte carlo is deterministic per seed and probabilities are sane", () => {
    const a = build();
    const r1 = runMonteCarlo(a, { runs: 300, seed: 7 });
    const r2 = runMonteCarlo(a, { runs: 300, seed: 7 });
    expect(r1.teams.map((t) => t.pFirst)).toEqual(r2.teams.map((t) => t.pFirst));
    const sumFirst = r1.teams.reduce((s, t) => s + t.pFirst, 0);
    expect(sumFirst).toBeLessThanOrEqual(1.0001);
    for (const t of r1.teams) expect(t.rankHistogram.reduce((s, x) => s + x, 0)).toBeCloseTo(1);
    expect(r1.assumptions.length).toBeGreaterThan(3);
  });

  it("shadow auction compares an alternative squad without touching official data", () => {
    const a = build();
    const picks = a.market.available.slice(0, 3).map((p) => ({ player: p, price: 2 }));
    const s = shadowCompare(a, "A", picks);
    expect(s.shadow.rating.count).toBe(3);
    expect(a.byId.A.rating.count).toBe(2);
    expect(s.diff.spent).toBeLessThan(0);
  });

  it("co-pilot answers from data with reasoning", () => {
    const a = build();
    const players = [...a.market.available, ...a.teams.flatMap((t) => t.players)];
    const ctx = { a, myTeamId: "A", strategy: "balanced" as const, players };
    const strongest = askCopilot("Which team is currently strongest?", ctx);
    expect(strongest.kind).toBe("calculated");
    expect(strongest.answer).toMatch(/leads/);
    const afford = askCopilot("How much can team B afford?", { ...ctx, a: { ...a, teams: a.teams.map((t) => ({ ...t, team: { ...t.team, name: t.team.id === "B" ? "Bengaluru" : t.team.name } })) } });
    expect(afford.topic).toMatch(/affordability|Affordability/);
    const safe = askCopilot("What is my maximum safe bid?", ctx);
    expect(safe.answer).toMatch(/safe bid/);
    const help = askCopilot("tell me a joke", ctx);
    expect(help.kind).toBe("help");
    for (const q of ["What is my team's biggest weakness?", "Can I complete my squad with my remaining purse?", "Which teams are spending aggressively?", "What should my next three purchases focus on?", "How can I overtake the current leader?", "Which player will improve my average rating most?"]) {
      const r = askCopilot(q, ctx);
      expect(r.kind).not.toBe("help");
      expect(r.answer.length).toBeGreaterThan(10);
    }
  });
});
