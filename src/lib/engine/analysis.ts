import { mean, median, round2 } from "./money";
import { officialMetric, rateTeam, type TeamRating } from "./ratings";
import { ALL_CELLS, cellOf, evaluateRules, type Cell, type RuleEvaluation } from "./rules";
import type { EventSnapshot, Player, RosterEntry, RuleSet, Strategy, Team } from "./types";

/** Where the per-slot floor price comes from — shown to users so they know how reliable reserves are. */
export type FloorSource = "configured" | "base_prices" | "observed_sales" | "none";

export interface MarketStats {
  rules: RuleSet;
  /** entered players that are still obtainable (not sold, not withdrawn) */
  available: Player[];
  /** cheapest legal price for a slot in a cell */
  floorPrice: Record<Cell, number>;
  /** expected price for a slot in a cell, from winning prices this event (or base prices) */
  expectedPrice: Record<Cell, number>;
  /** expected rating a team will realistically get in a cell */
  expectedRating: Record<Cell, number | null>;
  supply: Record<Cell, number>;
  /** mandatory slots still required in each cell, across all teams */
  demand: Record<Cell, number>;
  /** number of distinct teams that still need at least one player in each cell */
  demandTeams: Record<Cell, number>;
  soldCount: number;
  avgSoldPrice: number | null;
  medianSoldPrice: number | null;
  globalFloor: number;
  floorSource: FloorSource;
  /** rating used for unknown future players (median of entered players), with how it was derived */
  typicalRating: number | null;
  /** share of entered players with a recorded role+origin (0..1) */
  categoryCoverage: number;
  /** share of entered players with a recorded rating (0..1) */
  ratingCoverage: number;
  enteredCount: number;
  /** minimum price per player used by the purse rule: configured minimum, else cheapest recorded base price, else 0 */
  ruleMinPrice: number;
}

export interface CompletionPlan {
  /** minimum estimated cost to complete the squad under the rules */
  cost: number;
  /** cells chosen for the remaining slots ("ANY" = role not constrained) */
  slots: (Cell | "ANY")[];
  /** true when the recorded player pool was too small and floor prices were used */
  provisional: boolean;
  feasible: boolean;
}

export interface TeamAnalysis {
  team: Team;
  entries: RosterEntry[];
  players: Player[];
  /** false when the organiser has not set this team's initial purse */
  purseKnown: boolean;
  initialPurse: number;
  spent: number;
  /** NaN when the purse is unknown */
  remaining: number;
  utilization: number;
  avgPrice: number | null;
  maxPrice: number | null;
  minPrice: number | null;
  rules: RuleEvaluation;
  rating: TeamRating;
  official: number | null;
  /** minimum money needed to complete the mandatory squad (constrained optimisation) */
  floorReserve: number;
  completion: CompletionPlan;
  /** money a team should reserve at realistic prices */
  expectedReserve: number;
  /** remaining - floorReserve (NaN when purse unknown) */
  discretionary: number;
  purseSufficient: boolean;
  projectedAverage: number | null;
  projectedTotal: number;
  /** largest single bid the team can make and still complete the mandatory squad (NaN when purse unknown) */
  maxSingleBid: number;
  /**
   * Purse-rule maximum bid: remaining − (players still needed for the minimum squad after this buy × minimum price).
   * Mirrors the server's team_max_bid(); enforced when rules.enforce_max_bid is on. NaN when purse unknown.
   */
  ruleMaxBid: number;
  /** players still needed for the minimum squad after the next purchase */
  ruleSlotsAfter: number;
  overseasCount: number;
  indianCount: number;
  hasEstimates: boolean;
}

export interface EventAnalysis {
  rules: RuleSet;
  teams: TeamAnalysis[];
  byId: Record<string, TeamAnalysis>;
  market: MarketStats;
  leaderboard: LeaderboardRow[];
}

export interface LeaderboardRow {
  teamId: string;
  officialRank: number;
  officialValue: number | null;
  eligible: boolean;
  analyticalRank: number;
  efficiencyRank: number;
  efficiency: number | null;
  balanceRank: number;
  projectedRank: number;
}

export function buildRosters(s: EventSnapshot) {
  const byId = new Map(s.players.map((p) => [p.id, p]));
  const rosters: Record<string, RosterEntry[]> = Object.fromEntries(s.teams.map((t) => [t.id, []]));
  const officiallySold = new Set<string>();
  for (const tx of s.transactions) {
    if (tx.status !== "active" || tx.type !== "sale" || !tx.team_id) continue;
    const p = byId.get(tx.player_id);
    if (!p || !rosters[tx.team_id]) continue;
    officiallySold.add(p.id);
    rosters[tx.team_id].push({ player: p, price: Number(tx.amount ?? 0), source: "official" });
  }
  if (s.extraEntries) {
    for (const [teamId, list] of Object.entries(s.extraEntries)) {
      if (!rosters[teamId]) continue;
      for (const e of list) {
        // Official transactions are always the source of truth.
        if (officiallySold.has(e.player.id)) continue;
        rosters[teamId].push(e);
      }
    }
  }
  return { rosters, officiallySold };
}

type BaseMarket = Omit<MarketStats, "demand" | "demandTeams">;

function marketStats(s: EventSnapshot, taken: Set<string>): BaseMarket {
  const available = s.players.filter(
    (p) => !taken.has(p.id) && (p.auction_status === "available" || p.auction_status === "upcoming" || p.auction_status === "unsold"),
  );
  const byId = new Map(s.players.map((p) => [p.id, p]));
  const soldPrices = Object.fromEntries(ALL_CELLS.map((c) => [c, [] as number[]])) as Record<Cell, number[]>;
  const allSold: number[] = [];
  for (const tx of s.transactions) {
    if (tx.status !== "active" || tx.type !== "sale") continue;
    const p = byId.get(tx.player_id);
    if (!p) continue;
    const amt = Number(tx.amount ?? 0);
    allSold.push(amt);
    const c = cellOf(p);
    if (c) soldPrices[c].push(amt);
  }
  const positiveBases = available.map((p) => Number(p.base_price)).filter((x) => x > 0);
  let floorSource: FloorSource;
  let globalFloor: number;
  if (s.rules.min_player_price !== null && s.rules.min_player_price !== undefined) {
    floorSource = "configured";
    globalFloor = s.rules.min_player_price;
  } else if (positiveBases.length) {
    floorSource = "base_prices";
    globalFloor = Math.min(...positiveBases);
  } else if (allSold.length) {
    floorSource = "observed_sales";
    globalFloor = Math.min(...allSold);
  } else {
    floorSource = "none";
    globalFloor = 0;
  }
  const floorPrice = {} as Record<Cell, number>;
  const expectedPrice = {} as Record<Cell, number>;
  const expectedRating = {} as Record<Cell, number | null>;
  const supply = {} as Record<Cell, number>;
  const medianBase = median(positiveBases);
  const medianSold = median(allSold);
  const ratedAll = s.players.map((p) => p.overall).filter((x): x is number => typeof x === "number");
  const typicalRating = ratedAll.length ? round2(median(ratedAll) as number) : null;
  for (const cell of ALL_CELLS) {
    const pool = available.filter((p) => cellOf(p) === cell);
    supply[cell] = pool.length;
    const poolBases = pool.map((p) => Number(p.base_price)).filter((x) => x > 0);
    const floor = s.rules.min_player_price ?? (poolBases.length ? Math.min(...poolBases) : globalFloor);
    floorPrice[cell] = round2(Math.max(floor, 0));
    const sold = soldPrices[cell];
    const exp =
      sold.length >= 2 ? median(sold) : sold.length === 1 ? (sold[0] + (median(poolBases) ?? medianSold ?? sold[0])) / 2 : median(poolBases) ?? medianBase ?? medianSold ?? floor;
    expectedPrice[cell] = round2(Math.max(floorPrice[cell], exp ?? floor));
    const ratings = pool.map((p) => p.overall).filter((x): x is number => typeof x === "number");
    expectedRating[cell] = ratings.length ? round2(median(ratings) as number) : typicalRating;
  }
  const entered = s.players.length;
  return {
    rules: s.rules,
    available,
    floorPrice,
    expectedPrice,
    expectedRating,
    supply,
    soldCount: allSold.length,
    avgSoldPrice: allSold.length ? round2(mean(allSold) as number) : null,
    medianSoldPrice: medianSold === null ? null : round2(medianSold),
    globalFloor: round2(globalFloor),
    floorSource,
    typicalRating,
    categoryCoverage: entered ? s.players.filter((p) => cellOf(p) !== null).length / entered : 0,
    ratingCoverage: entered ? ratedAll.length / entered : 0,
    enteredCount: entered,
    ruleMinPrice: round2(
      s.rules.min_player_price ??
        (() => {
          const b = s.players.filter((p) => p.auction_status !== "withdrawn").map((p) => Number(p.base_price)).filter((x) => x > 0);
          return b.length ? Math.min(...b) : 0;
        })(),
    ),
  };
}

/**
 * Minimum squad-completion cost by uniform-cost search over "how many more players per cell".
 * Each extra player in a cell costs the next-cheapest recorded available player in that cell
 * (distinct players, so overlapping requirements cannot reuse one cheap player), falling back to
 * the floor price when the recorded pool runs out (result marked provisional).
 */
const planCache = new WeakMap<object, Map<string, CompletionPlan>>();

/**
 * Minimum squad-completion cost by uniform-cost search over "how many more players per cell".
 * Each extra player in a cell costs the next-cheapest recorded available player in that cell
 * (distinct players, so overlapping requirements cannot reuse one cheap player), falling back to
 * the floor price when the recorded pool runs out (result marked provisional). Only cells that
 * reduce an unmet minimum are expanded; remaining squad-minimum slots are filled at the cheapest price.
 */
export function completionPlan(rules: RuleSet, evaluation: RuleEvaluation, market: BaseMarket, priceOf: "floor" | "expected" = "floor"): CompletionPlan {
  const need = Math.max(evaluation.slotsRequired, 0);
  if (need === 0) return { cost: 0, slots: [], provisional: false, feasible: evaluation.feasible };
  const key = `${priceOf}|${evaluation.size}|${need}|${ALL_CELLS.map((c) => evaluation.cellCounts[c]).join(",")}`;
  let cache = planCache.get(market);
  if (!cache) planCache.set(market, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const result = searchPlan(rules, evaluation, market, priceOf, need);
  cache.set(key, result);
  return result;
}

function searchPlan(rules: RuleSet, evaluation: RuleEvaluation, market: BaseMarket, priceOf: "floor" | "expected", need: number): CompletionPlan {
  const sortedPrices = ALL_CELLS.map((c) =>
    market.available
      .filter((p) => cellOf(p) === c)
      .map((p) => Math.max(Number(p.base_price) || 0, market.floorPrice[c]))
      .sort((x, y) => x - y),
  );
  const fallback = (i: number) => (priceOf === "expected" ? market.expectedPrice[ALL_CELLS[i]] : market.floorPrice[ALL_CELLS[i]]);
  const anyPrice = priceOf === "expected" ? Math.max(market.globalFloor, Math.min(...ALL_CELLS.map((c) => market.expectedPrice[c]))) : market.globalFloor;
  const priceAt = (i: number, k: number) => {
    const v = sortedPrices[i][k];
    if (priceOf === "expected") return Math.max(v ?? fallback(i), market.expectedPrice[ALL_CELLS[i]]);
    return v ?? fallback(i);
  };
  const base = ALL_CELLS.map((c) => evaluation.cellCounts[c]);
  const cellOk = ALL_CELLS.map((cell) => {
    const [o, cat] = cell.split(":");
    return (con: (typeof rules.constraints)[number]) => (con.category === null || con.category === cat) && (con.origin === null || con.origin === o);
  });
  const mins = rules.constraints.filter((c) => c.min !== null && (c.min as number) > 0);
  const maxs = rules.constraints.filter((c) => c.max !== null);
  const minMembers = mins.map((con) => ALL_CELLS.map((_, i) => cellOk[i](con)));
  const maxMembers = maxs.map((con) => ALL_CELLS.map((_, i) => cellOk[i](con)));
  const sumOver = (members: boolean[], add: number[]) => members.reduce((s, m, i) => (m ? s + base[i] + add[i] : s), 0);
  const deficits = (add: number[]) => mins.map((con, j) => Math.max(0, (con.min as number) - sumOver(minMembers[j], add)));

  type Node = { add: number[]; cost: number; prov: boolean };
  // binary min-heap on cost
  const heap: Node[] = [];
  const push = (n: Node) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].cost <= heap[i].cost) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].cost < heap[m].cost) m = l;
        if (r < heap.length && heap[r].cost < heap[m].cost) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  push({ add: ALL_CELLS.map(() => 0), cost: 0, prov: false });
  const best = new Map<string, number>();
  let expansions = 0;
  while (heap.length && expansions < 5000) {
    const cur = pop();
    expansions++;
    const added = cur.add.reduce((x, y) => x + y, 0);
    const def = deficits(cur.add);
    if (def.every((d) => d === 0)) {
      const flex = Math.max(0, need - added);
      const slots: (Cell | "ANY")[] = [];
      cur.add.forEach((n, i) => {
        for (let k = 0; k < n; k++) slots.push(ALL_CELLS[i]);
      });
      for (let k = 0; k < flex; k++) slots.push("ANY");
      return { cost: round2(cur.cost + flex * anyPrice), slots, provisional: cur.prov || flex > 0 || market.floorSource === "none", feasible: evaluation.feasible };
    }
    if (evaluation.size + added >= rules.squad_max) continue;
    for (let i = 0; i < ALL_CELLS.length; i++) {
      // only expand cells that reduce an unmet minimum
      if (!mins.some((_, j) => def[j] > 0 && minMembers[j][i])) continue;
      if (maxs.some((con, j) => maxMembers[j][i] && sumOver(maxMembers[j], cur.add) + 1 > (con.max as number))) continue;
      const add = cur.add.slice();
      add[i]++;
      const k = add.join(",");
      const cost = cur.cost + priceAt(i, cur.add[i]);
      if ((best.get(k) ?? Infinity) <= cost) continue;
      best.set(k, cost);
      push({ add, cost, prov: cur.prov || sortedPrices[i][cur.add[i]] === undefined });
    }
  }
  // fallback: greedy plan from the rule engine
  const cost = evaluation.mandatoryPlan.reduce((s, c) => s + (priceOf === "expected" ? market.expectedPrice[c] : market.floorPrice[c]), 0) + evaluation.flexSlots * anyPrice;
  return { cost: round2(cost), slots: [...evaluation.mandatoryPlan, ...Array(evaluation.flexSlots).fill("ANY")], provisional: true, feasible: evaluation.feasible };
}

export function reserveFor(evaluation: RuleEvaluation, market: BaseMarket, strategy: Strategy | "floor" | "expected") {
  const floor = completionPlan(market.rules, evaluation, market, "floor").cost;
  if (strategy === "floor" || strategy === "aggressive") return floor;
  const expected = completionPlan(market.rules, evaluation, market, "expected").cost;
  if (strategy === "balanced") return round2((floor + expected) / 2);
  return expected;
}

function projectRating(evaluation: RuleEvaluation, rating: TeamRating, market: BaseMarket) {
  let total = rating.total;
  let n = rating.ratedCount;
  for (const c of evaluation.mandatoryPlan) {
    const e = market.expectedRating[c] ?? market.typicalRating;
    if (e !== null) {
      total += e;
      n++;
    }
  }
  if (evaluation.flexSlots && market.typicalRating !== null) {
    total += market.typicalRating * evaluation.flexSlots;
    n += evaluation.flexSlots;
  }
  return { projectedTotal: round2(total), projectedAverage: n ? round2(total / n) : null };
}

export function analyseTeam(rules: RuleSet, team: Team, entries: RosterEntry[], market: BaseMarket, purseOverride?: number): TeamAnalysis {
  const players = entries.map((e) => e.player);
  const prices = entries.map((e) => e.price);
  const rawPurse = purseOverride ?? team.initial_purse;
  const purseKnown = rawPurse !== null && rawPurse !== undefined && !Number.isNaN(Number(rawPurse));
  const initialPurse = purseKnown ? Number(rawPurse) : 0;
  const spent = round2(prices.reduce((a, b) => a + b, 0));
  const remaining = purseKnown ? round2(initialPurse - spent) : NaN;
  const evaluation = evaluateRules(rules, players);
  const rating = rateTeam(rules, evaluation, players);
  const completion = completionPlan(rules, evaluation, market, "floor");
  const floorReserve = completion.cost;
  const expectedReserve = reserveFor(evaluation, market, "expected");
  const { projectedAverage, projectedTotal } = projectRating(evaluation, rating, market);
  const firstSlot = completion.slots[0];
  const firstCellFloor = firstSlot ? (firstSlot === "ANY" ? market.globalFloor : market.floorPrice[firstSlot]) : 0;
  const maxSingleBid = !purseKnown
    ? NaN
    : evaluation.slotsRemaining === 0
      ? 0
      : round2(Math.max(0, remaining - (evaluation.slotsRequired > 0 ? floorReserve - firstCellFloor : 0)));
  const purseSufficient = !purseKnown || remaining + 1e-9 >= floorReserve;
  if (purseKnown && !purseSufficient) {
    evaluation.alerts.unshift({
      level: "critical",
      kind: "purse",
      message: `Remaining purse (${round2(remaining)}) is insufficient to complete the mandatory squad (needs at least ${floorReserve}${completion.provisional ? ", provisional" : ""}).`,
    });
  }
  if (purseKnown && remaining < 0) {
    evaluation.alerts.unshift({ level: "critical", kind: "purse", message: `Purse overspent by ${round2(-remaining)}.` });
  }
  if (!purseKnown) {
    evaluation.alerts.push({ level: "info", kind: "purse", message: "Initial purse not set yet — purse calculations are disabled for this team." });
  }
  const ruleSlotsAfter = Math.max(0, rules.squad_min - (players.length + 1));
  const ruleMaxBid = purseKnown ? round2(Math.max(0, remaining - ruleSlotsAfter * market.ruleMinPrice)) : NaN;
  return {
    team,
    entries,
    players,
    ruleMaxBid,
    ruleSlotsAfter,
    purseKnown,
    initialPurse,
    spent,
    remaining,
    utilization: purseKnown && initialPurse ? spent / initialPurse : NaN,
    avgPrice: prices.length ? round2(spent / prices.length) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    minPrice: prices.length ? Math.min(...prices) : null,
    rules: evaluation,
    rating,
    official: officialMetric(rules, rating),
    floorReserve,
    completion,
    expectedReserve,
    discretionary: purseKnown ? round2(remaining - floorReserve) : NaN,
    purseSufficient,
    projectedAverage,
    projectedTotal,
    maxSingleBid,
    overseasCount: players.filter((p) => p.origin === "overseas").length,
    indianCount: players.filter((p) => p.origin === "indian").length,
    hasEstimates: entries.some((e) => e.source !== "official"),
  };
}

const finite = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : v);

function rankBy<T>(rows: T[], value: (r: T) => number | null, eligible: (r: T) => boolean = () => true) {
  const sorted = [...rows].sort((a, b) => {
    const ea = eligible(a) ? 1 : 0;
    const eb = eligible(b) ? 1 : 0;
    if (ea !== eb) return eb - ea;
    const va = finite(value(a));
    const vb = finite(value(b));
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  });
  const ranks = new Map<T, number>();
  sorted.forEach((r, i) => ranks.set(r, i + 1));
  return ranks;
}

export function isOfficiallyEligible(rules: RuleSet, t: TeamAnalysis) {
  if (t.rules.hasViolation || (t.purseKnown && t.remaining < -1e-9)) return false;
  if (rules.require_complete_squad) return t.rules.complete;
  return t.rating.count > 0;
}

export function buildLeaderboard(rules: RuleSet, teams: TeamAnalysis[]): LeaderboardRow[] {
  const official = rankBy(teams, (t) => t.official, (t) => isOfficiallyEligible(rules, t));
  const analytical = rankBy(teams, (t) => t.rating.weighted);
  const eff = (t: TeamAnalysis) => (t.spent > 0 ? t.rating.total / t.spent : null);
  const efficiency = rankBy(teams, eff);
  const balance = rankBy(teams, (t) => t.rating.balance);
  const projected = rankBy(teams, (t) => (rules.ranking_formula === "total" ? t.projectedTotal : t.projectedAverage));
  return teams
    .map((t) => ({
      teamId: t.team.id,
      officialRank: official.get(t)!,
      officialValue: t.official,
      eligible: isOfficiallyEligible(rules, t),
      analyticalRank: analytical.get(t)!,
      efficiencyRank: efficiency.get(t)!,
      efficiency: eff(t) === null ? null : round2(eff(t) as number),
      balanceRank: balance.get(t)!,
      projectedRank: projected.get(t)!,
    }))
    .sort((a, b) => a.officialRank - b.officialRank);
}

export function analyseEvent(s: EventSnapshot): EventAnalysis {
  const { rosters } = buildRosters(s);
  const taken = new Set(Object.values(rosters).flatMap((es) => es.map((e) => e.player.id)));
  const base = marketStats(s, taken);
  const teams = s.teams.map((t) => analyseTeam(s.rules, t, rosters[t.id], base, s.purseOverrides?.[t.id]));
  const demand = Object.fromEntries(ALL_CELLS.map((c) => [c, 0])) as Record<Cell, number>;
  const demandTeams = { ...demand };
  for (const t of teams) {
    for (const c of t.rules.mandatoryPlan) demand[c]++;
    for (const c of new Set(t.rules.mandatoryPlan)) demandTeams[c]++;
  }
  const market: MarketStats = { ...base, demand, demandTeams };
  return {
    rules: s.rules,
    teams,
    byId: Object.fromEntries(teams.map((t) => [t.team.id, t])),
    market,
    leaderboard: buildLeaderboard(s.rules, teams),
  };
}

export const FLOOR_SOURCE_LABEL: Record<FloorSource, string> = {
  configured: "configured minimum price per player",
  base_prices: "cheapest recorded base price",
  observed_sales: "lowest winning price so far (no base prices recorded)",
  none: "no price information yet — reserves are 0 until prices are recorded or a minimum price is configured",
};
