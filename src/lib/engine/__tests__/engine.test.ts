import { describe, expect, it } from "vitest";
import {
  analyseEvent,
  contestedPlayers,
  diffAlerts,
  DEFAULT_ALERT_PREFS,
  evaluateRules,
  generateInsights,
  playerValues,
  predictCompetitor,
  simulate,
  smartBid,
  type Player,
} from "..";
import { exampleRules, mkPlayer, mkTeam, sale } from "./fixtures";

describe("rating engine", () => {
  it("computes the spec example average to two decimals", () => {
    const rules = exampleRules();
    const ps = [9.5, 9.2, 8.8, 9.7, 8.9].map((r) => mkPlayer("BAT", "indian", r));
    const txs = ps.map((p) => sale(p, "A", 1));
    const a = analyseEvent({ rules, teams: [mkTeam("A")], players: ps, transactions: txs });
    expect(a.byId.A.rating.total).toBe(46.1);
    expect(a.byId.A.rating.average).toBe(9.22);
  });

  it("ignores voided transactions so ratings are reproducible", () => {
    const rules = exampleRules();
    const p1 = mkPlayer("BAT", "indian", 9);
    const p2 = mkPlayer("BAT", "indian", 7);
    const txs = [sale(p1, "A", 5), { ...sale(p2, "A", 5), status: "voided" as const }];
    const a = analyseEvent({ rules, teams: [mkTeam("A")], players: [p1, p2], transactions: txs });
    expect(a.byId.A.rating.average).toBe(9);
    expect(a.byId.A.spent).toBe(5);
    expect(a.byId.A.remaining).toBe(95);
  });
});

describe("rule engine", () => {
  it("flags violations, incomplete requirements and the mandatory plan", () => {
    const rules = exampleRules();
    const ev = evaluateRules(rules, [
      mkPlayer("BAT", "overseas", 9),
      mkPlayer("BAT", "overseas", 9),
      mkPlayer("BOWL", "indian", 8),
    ]);
    expect(ev.hasViolation).toBe(true);
    expect(ev.status).toBe("violation");
    expect(ev.alerts.some((a) => a.level === "red" && a.message.includes("Overseas batsmen"))).toBe(true);
    expect(ev.alerts.some((a) => a.level === "yellow" && a.message.includes("Indian bowlers"))).toBe(true);
  });

  it("computes minimal remaining requirements", () => {
    const ev = evaluateRules(exampleRules(), []);
    // 2 IB + 1 OB + 2 IBo + 2 OBo + 1 IAR + 1 WK = 9
    expect(ev.slotsRequired).toBe(9);
    expect(ev.feasible).toBe(true);
    expect(ev.status).toBe("incomplete");
  });

  it("marks a complete legal squad as valid", () => {
    const ps = [
      mkPlayer("BAT", "indian", 8), mkPlayer("BAT", "indian", 8), mkPlayer("BAT", "overseas", 8),
      mkPlayer("BOWL", "indian", 8), mkPlayer("BOWL", "indian", 8), mkPlayer("BOWL", "overseas", 8),
      mkPlayer("BOWL", "overseas", 8), mkPlayer("AR", "indian", 8), mkPlayer("WK", "indian", 8),
    ];
    const ev = evaluateRules(exampleRules(), ps);
    expect(ev.status).toBe("valid");
    expect(ev.complete).toBe(true);
  });

  it("detects future infeasibility (squad full of non-mandatory cells)", () => {
    const rules = { ...exampleRules(), squad_max: 9 };
    const ps = [mkPlayer("AR", "indian", 8), mkPlayer("AR", "indian", 8), mkPlayer("AR", "indian", 8)];
    const ev = evaluateRules(rules, ps);
    // 3 AR + 8 still mandatory = 11 > 9
    expect(ev.feasible).toBe(false);
    expect(ev.status).toBe("at_risk");
  });
});

describe("purse & smart bid", () => {
  const setup = () => {
    const rules = { ...exampleRules(), squad_min: 4, squad_max: 4, constraints: exampleRules().constraints.slice(0, 1) };
    const pool: Player[] = [];
    for (let i = 0; i < 10; i++) pool.push(mkPlayer("BAT", "indian", 7 + i * 0.25, 2));
    const bought = mkPlayer("BAT", "indian", 9, 2);
    const txs = [sale(bought, "A", 65)];
    return { rules, players: [...pool, bought], txs };
  };

  it("never suggests spending money reserved for mandatory slots", () => {
    const { rules, players, txs } = setup();
    const a = analyseEvent({ rules, teams: [mkTeam("A"), mkTeam("B")], players, transactions: txs });
    const me = a.byId.A;
    expect(me.remaining).toBe(35);
    expect(me.rules.slotsRequired).toBe(3);
    const target = players.find((p) => p.overall === 9.25)!;
    for (const strat of ["aggressive", "balanced", "conservative"] as const) {
      const r = smartBid(a, "A", target, strat);
      // after buying, 2 mandatory slots remain at floor price 2 each => must keep >= 4
      expect(r.minimumReserve).toBe(4);
      expect(r.maxBid).toBeLessThanOrEqual(35 - 4);
      expect(r.maxBid).toBeGreaterThan(0);
      expect(r.reasoning.length).toBeGreaterThan(3);
    }
    const agg = smartBid(a, "A", target, "aggressive").maxBid;
    const con = smartBid(a, "A", target, "conservative").maxBid;
    expect(agg).toBeGreaterThanOrEqual(con);
  });

  it("blocks players that would break a maximum", () => {
    const rules = exampleRules();
    const a1 = mkPlayer("BAT", "overseas", 9);
    const a2 = mkPlayer("BAT", "overseas", 9.5);
    const a = analyseEvent({ rules, teams: [mkTeam("A")], players: [a1, a2], transactions: [sale(a1, "A", 5)] });
    const r = smartBid(a, "A", a2, "balanced");
    expect(r.eligible).toBe(false);
    expect(r.maxBid).toBe(0);
    expect(r.blockedReason).toMatch(/Overseas batsmen/);
  });

  it("raises a critical alert when purse cannot complete the squad", () => {
    const rules = exampleRules();
    const p = mkPlayer("BAT", "indian", 9, 2);
    const others = [mkPlayer("BOWL", "indian", 8, 2), mkPlayer("WK", "indian", 8, 2)];
    const a = analyseEvent({ rules, teams: [mkTeam("A", 20)], players: [p, ...others], transactions: [sale(p, "A", 15)] });
    expect(a.byId.A.purseSufficient).toBe(false);
    expect(a.byId.A.rules.alerts[0].level).toBe("critical");
  });
});

describe("observations, simulation and predictions", () => {
  it("official transactions override participant observations", () => {
    const rules = exampleRules();
    const p = mkPlayer("BAT", "indian", 9);
    const txs = [sale(p, "A", 10)];
    const a = analyseEvent({
      rules, teams: [mkTeam("A"), mkTeam("B")], players: [p], transactions: txs,
      extraEntries: { B: [{ player: p, price: 3, source: "participant" }] },
    });
    expect(a.byId.B.players.length).toBe(0);
    expect(a.byId.A.spent).toBe(10);
  });

  it("simulation is private and does not mutate the snapshot", () => {
    const rules = exampleRules();
    const p = mkPlayer("BAT", "indian", 9.8);
    const snap = { rules, teams: [mkTeam("A")], players: [p], transactions: [] };
    const sim = simulate(snap, [{ id: "h", player_id: p.id, team_id: "A", price: 12 }]);
    expect(sim.byId.A.remaining).toBe(88);
    expect(sim.byId.A.rating.average).toBe(9.8);
    expect(analyseEvent(snap).byId.A.remaining).toBe(100);
    expect(p.auction_status).toBe("available");
  });

  it("predicts competitor needs with evidence and flags contested players", () => {
    const rules = exampleRules();
    const pool = [mkPlayer("BOWL", "overseas", 9.4, 2), mkPlayer("BAT", "indian", 8, 2)];
    const a = analyseEvent({ rules, teams: [mkTeam("A"), mkTeam("B"), mkTeam("C")], players: pool, transactions: [] });
    const pred = predictCompetitor(a, a.byId.B);
    expect(pred.likelyNext.length).toBeGreaterThan(0);
    expect(pred.likelyNext[0].evidence.length).toBeGreaterThan(2);
    expect(contestedPlayers(a).length).toBeGreaterThan(0);
  });

  it("generates data-referencing insights", () => {
    const rules = exampleRules();
    const pool = [mkPlayer("BOWL", "overseas", 9.4, 2), mkPlayer("WK", "indian", 8.5, 2)];
    const b1 = mkPlayer("BAT", "indian", 9, 2);
    const b2 = mkPlayer("BOWL", "indian", 8, 2);
    const a = analyseEvent({ rules, teams: [mkTeam("A"), mkTeam("B", 30)], players: [...pool, b1, b2], transactions: [sale(b1, "A", 10), sale(b2, "B", 25)] });
    const ins = generateInsights(a, "A");
    expect(ins.length).toBeGreaterThan(0);
    for (const i of ins) {
      expect(i.detected).toMatch(/\d/);
      expect(i.calculation.length).toBeGreaterThan(0);
    }
  });

  it("player value index is 0..100 within category", () => {
    const rules = exampleRules();
    const ps = [mkPlayer("BAT", "indian", 9, 1), mkPlayer("BAT", "indian", 9, 4), mkPlayer("BAT", "indian", 8, 2)];
    const a = analyseEvent({ rules, teams: [mkTeam("A")], players: ps, transactions: [] });
    const v = playerValues(a, ps, "A");
    expect(Math.max(...v.map((x) => x.valueIndex!))).toBe(100);
    expect(Math.min(...v.map((x) => x.valueIndex!))).toBe(0);
  });

  it("emits alerts on diff", () => {
    const rules = exampleRules();
    const p = mkPlayer("BAT", "indian", 9.5);
    const before = analyseEvent({ rules, teams: [mkTeam("A"), mkTeam("B", 12)], players: [p], transactions: [] });
    const p2 = { ...p };
    const after = analyseEvent({ rules, teams: [mkTeam("A"), mkTeam("B", 12)], players: [p2], transactions: [sale(p2, "B", 5)] });
    const al = diffAlerts(before, after, "A", DEFAULT_ALERT_PREFS);
    expect(al.some((x) => x.title === "High-rated player sold")).toBe(true);
    expect(al.some((x) => x.title === "Competitor purse low")).toBe(true);
  });
});

describe("leaderboard", () => {
  it("does not rank incomplete squads as official winners when complete squad is required", () => {
    const rules = { ...exampleRules(), squad_min: 1, squad_max: 2, constraints: [] };
    const p1 = mkPlayer("BAT", "indian", 9.9);
    const a = analyseEvent({ rules: { ...rules, squad_min: 2 }, teams: [mkTeam("A"), mkTeam("B")], players: [p1, mkPlayer("BAT", "indian", 7), mkPlayer("BAT", "indian", 7)], transactions: [] });
    expect(a.leaderboard.every((r) => !r.eligible)).toBe(true);
  });
});

describe("scale", () => {
  it("analyses 40 teams and 240 players quickly", () => {
    const rules = exampleRules();
    const cats = ["BAT", "BOWL", "AR", "WK"] as const;
    const players: Player[] = [];
    for (let i = 0; i < 240; i++) players.push(mkPlayer(cats[i % 4], i % 3 ? "indian" : "overseas", 6 + ((i * 37) % 40) / 10, 0.5 + (i % 5)));
    const teams = Array.from({ length: 40 }, (_, i) => mkTeam(`T${i}`));
    const txs = players.slice(0, 120).map((p, i) => sale(p, `T${i % 40}`, 1 + (i % 7)));
    const t0 = performance.now();
    const a = analyseEvent({ rules, teams, players, transactions: txs });
    for (const p of a.market.available.slice(0, 20)) smartBid(a, "T0", p, "balanced");
    generateInsights(a, "T0");
    const ms = performance.now() - t0;
    expect(a.teams.length).toBe(40);
    expect(ms).toBeLessThan(2000);
  });
});
