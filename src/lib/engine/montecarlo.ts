// Monte Carlo auction simulator — transparent, seeded and deterministic for a given seed.
import type { EventAnalysis } from "./analysis";
import { median, round2 } from "./money";
import { ALL_CELLS, cellOf, type Cell } from "./rules";
import { priceModel } from "./intel";
import type { Category, Origin, Player } from "./types";

export interface MonteCarloTeamResult {
  teamId: string;
  teamName: string;
  pFirst: number;
  pValid: number;
  rankHistogram: number[]; // index 0 = rank 1
  expectedFinal: number | null;
  p10: number | null;
  p90: number | null;
}

export interface MonteCarloResult {
  runs: number;
  teams: MonteCarloTeamResult[];
  assumptions: string[];
  reliability: "low" | "medium" | "high";
  limitations: string[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gaussian = (rnd: () => number) => {
  const u = Math.max(rnd(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
};

export function runMonteCarlo(a: EventAnalysis, opts: { runs?: number; seed?: number } = {}): MonteCarloResult {
  const runs = Math.min(5000, Math.max(100, opts.runs ?? 2000));
  const rnd = mulberry32(opts.seed ?? 42);
  const rules = a.rules;
  const model = priceModel(a);
  const allPlayers = [...a.market.available, ...a.teams.flatMap((t) => t.players)];
  const ratings = allPlayers.map((p) => p.overall).filter((x): x is number => typeof x === "number");
  const cellsSeen = allPlayers.map((p) => cellOf(p));
  const limitations: string[] = [];
  if (ratings.length < 5) limitations.push(`Only ${ratings.length} rated player(s) recorded — future player quality is very uncertain.`);
  if (model.kind !== "regression") limitations.push(`Prices: ${model.description}.`);
  if (a.teams.some((t) => !t.purseKnown)) limitations.push("Teams without a set purse are simulated without a budget limit.");
  if (a.market.categoryCoverage < 0.5) limitations.push("Most players have no recorded role, so category rules are only partly simulated.");
  const fallbackRating = median(ratings) ?? rules.rating_scale_max * 0.7;
  const sd = ratings.length >= 3 ? Math.sqrt(ratings.reduce((s, r) => s + (r - (median(ratings) as number)) ** 2, 0) / ratings.length) || 0.5 : 0.8;
  const priceFor = (r: number | null) => model.predict(r) ?? Math.max(a.market.globalFloor, 1);

  const synth = (): Player => {
    const r = ratings.length ? ratings[Math.floor(rnd() * ratings.length)] + gaussian(rnd) * sd * 0.3 : fallbackRating + gaussian(rnd) * sd;
    const c = cellsSeen.length ? cellsSeen[Math.floor(rnd() * cellsSeen.length)] : null;
    const [origin, category] = c ? (c.split(":") as [Origin, Category]) : [null, null];
    return { id: "synthetic", name: "future player", origin, category, base_price: 0, overall: round2(Math.min(rules.rating_scale_max, Math.max(0, r))), auction_status: "available" };
  };

  const finals: number[][] = a.teams.map(() => []);
  const firsts = a.teams.map(() => 0);
  const valids = a.teams.map(() => 0);
  const hist = a.teams.map(() => a.teams.map(() => 0));
  const maxCons = rules.constraints.filter((c) => c.max !== null);
  const minCons = rules.constraints.filter((c) => c.min !== null && (c.min as number) > 0);
  const match = (c: (typeof rules.constraints)[number], cell: Cell) => {
    const [o, cat] = cell.split(":");
    return (c.category === null || c.category === cat) && (c.origin === null || c.origin === o);
  };

  for (let run = 0; run < runs; run++) {
    const st = a.teams.map((t) => ({
      purse: t.purseKnown ? t.remaining : Infinity,
      count: t.rating.count,
      total: t.rating.total,
      rated: t.rating.ratedCount,
      cells: { ...t.rules.cellCounts } as Record<Cell, number>,
    }));
    const pool = [...a.market.available].sort(() => rnd() - 0.5);
    for (let step = 0; step < 400; step++) {
      if (st.every((s) => s.count >= rules.squad_min) && rnd() < 0.5) break;
      if (st.every((s) => s.count >= rules.squad_max)) break;
      const p = pool.length ? pool.pop()! : synth();
      const cell = cellOf(p);
      const price = Math.max(Number(p.base_price) || 0, priceFor(p.overall) * Math.exp(gaussian(rnd) * 0.35));
      const cands: number[] = [];
      const weights: number[] = [];
      st.forEach((s, i) => {
        if (s.count >= rules.squad_max || s.purse < price) return;
        if (cell && maxCons.some((c) => match(c, cell) && ALL_CELLS.reduce((n, k) => (match(c, k) ? n + s.cells[k] : n), 0) + 1 > (c.max as number))) return;
        const needsCell = cell ? minCons.some((c) => match(c, cell) && ALL_CELLS.reduce((n, k) => (match(c, k) ? n + s.cells[k] : n), 0) < (c.min as number)) : false;
        const wants = s.count < rules.squad_min || needsCell;
        if (!wants && rnd() < 0.7) return;
        // reserve: keep the floor for remaining minimum slots
        const reserve = Math.max(0, rules.squad_min - s.count - 1) * a.market.globalFloor;
        if (Number.isFinite(s.purse) && s.purse - price < reserve) return;
        cands.push(i);
        weights.push((Number.isFinite(s.purse) ? Math.sqrt(s.purse) : 10) * (needsCell ? 2 : 1));
      });
      if (!cands.length) continue;
      let x = rnd() * weights.reduce((s, w) => s + w, 0);
      let w = cands[0];
      for (let k = 0; k < cands.length; k++) {
        x -= weights[k];
        if (x <= 0) {
          w = cands[k];
          break;
        }
      }
      const s = st[w];
      s.purse -= price;
      s.count++;
      if (typeof p.overall === "number") {
        s.total += p.overall;
        s.rated++;
      }
      if (cell) s.cells[cell]++;
    }
    const metric = st.map((s) => (rules.ranking_formula === "total" ? s.total : s.rated ? s.total / s.rated : 0));
    const valid = st.map((s) => s.count >= rules.squad_min && minCons.every((c) => ALL_CELLS.reduce((n, k) => (match(c, k) ? n + s.cells[k] : n), 0) >= (c.min as number)));
    const order = st.map((_, i) => i).sort((i, j) => {
      if (rules.require_complete_squad && valid[i] !== valid[j]) return valid[i] ? -1 : 1;
      return metric[j] - metric[i];
    });
    order.forEach((ti, rank) => hist[ti][rank]++);
    if (!rules.require_complete_squad || valid[order[0]]) firsts[order[0]]++;
    valid.forEach((v, i) => v && valids[i]++);
    metric.forEach((m, i) => finals[i].push(m));
  }
  const pct = (xs: number[], q: number) => {
    const s = [...xs].sort((x, y) => x - y);
    return s.length ? round2(s[Math.floor((s.length - 1) * q)]) : null;
  };
  return {
    runs,
    teams: a.teams.map((t, i) => ({
      teamId: t.team.id,
      teamName: t.team.name,
      pFirst: firsts[i] / runs,
      pValid: valids[i] / runs,
      rankHistogram: hist[i].map((n) => n / runs),
      expectedFinal: finals[i].length ? round2(finals[i].reduce((s, x) => s + x, 0) / finals[i].length) : null,
      p10: pct(finals[i], 0.1),
      p90: pct(finals[i], 0.9),
    })),
    assumptions: [
      "Unsold players already recorded are auctioned first, in random order.",
      `Players not yet entered are drawn from the ratings${cellsSeen.some(Boolean) ? " and roles" : ""} of the ${allPlayers.length} players recorded so far.`,
      `Prices follow ${model.description}, with ±35% random variation.`,
      "A team bids only if it has a free slot, can afford the price while keeping a floor reserve, and (mostly) needs the player.",
      "Among willing teams, richer teams and teams that need the role are more likely to win.",
      `The official ranking formula (${rules.ranking_formula}) decides the winner${rules.require_complete_squad ? "; only valid complete squads can win" : ""}.`,
    ],
    reliability: ratings.length >= 20 && model.kind === "regression" ? "medium" : "low",
    limitations,
  };
}
