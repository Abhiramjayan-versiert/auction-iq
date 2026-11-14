import { mean, median, round2 } from "./money";
import { officialMetric, rateTeam, type TeamRating } from "./ratings";
import { ALL_CELLS, cellOf, evaluateRules, type Cell, type RuleEvaluation } from "./rules";
import type { EventSnapshot, Player, RosterEntry, RuleSet, Strategy, Team } from "./types";

export interface MarketStats {
  available: Player[];
  /** cheapest legal price for a slot in a cell */
  floorPrice: Record<Cell, number>;
  /** expected price for a slot in a cell, from winning prices this event (or base prices) */
  expectedPrice: Record<Cell, number>;
  /** expected rating of a player a team will realistically get in a cell (median of available) */
  expectedRating: Record<Cell, number | null>;
  supply: Record<Cell, number>;
  demand: Record<Cell, number>;
  soldCount: number;
  avgSoldPrice: number | null;
  globalFloor: number;
}

export interface TeamAnalysis {
  team: Team;
  entries: RosterEntry[];
  players: Player[];
  initialPurse: number;
  spent: number;
  remaining: number;
  utilization: number;
  avgPrice: number | null;
  maxPrice: number | null;
  minPrice: number | null;
  rules: RuleEvaluation;
  rating: TeamRating;
  official: number | null;
  /** money that must be kept to complete the mandatory squad at floor prices */
  floorReserve: number;
  /** money a team should reserve at realistic prices */
  expectedReserve: number;
  /** remaining - floorReserve */
  discretionary: number;
  purseSufficient: boolean;
  projectedAverage: number | null;
  projectedTotal: number;
  /** largest single bid the team can make and still complete the mandatory squad */
  maxSingleBid: number;
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

function marketStats(s: EventSnapshot, taken: Set<string>): Omit<MarketStats, "demand"> {
  const available = s.players.filter(
    (p) => !taken.has(p.id) && (p.auction_status === "available" || p.auction_status === "upcoming" || p.auction_status === "unsold"),
  );
  const bases = s.players.map((p) => Number(p.base_price)).filter((x) => x > 0);
  const globalFloor = s.rules.min_player_price ?? (bases.length ? Math.min(...bases) : 0);
  const soldPrices: Record<Cell, number[]> = Object.fromEntries(ALL_CELLS.map((c) => [c, []])) as never;
  const allSold: number[] = [];
  const byId = new Map(s.players.map((p) => [p.id, p]));
  for (const tx of s.transactions) {
    if (tx.status !== "active" || tx.type !== "sale") continue;
    const p = byId.get(tx.player_id);
    if (!p) continue;
    soldPrices[cellOf(p)].push(Number(tx.amount ?? 0));
    allSold.push(Number(tx.amount ?? 0));
  }
  const floorPrice = {} as Record<Cell, number>;
  const expectedPrice = {} as Record<Cell, number>;
  const expectedRating = {} as Record<Cell, number | null>;
  const supply = {} as Record<Cell, number>;
  const globalMedianBase = median(available.map((p) => Number(p.base_price)));
  for (const cell of ALL_CELLS) {
    const pool = available.filter((p) => cellOf(p) === cell);
    supply[cell] = pool.length;
    const poolBases = pool.map((p) => Number(p.base_price));
    const floor = s.rules.min_player_price ?? (poolBases.length ? Math.min(...poolBases) : globalFloor);
    floorPrice[cell] = round2(Math.max(floor, 0));
    const sold = soldPrices[cell];
    const exp = sold.length >= 2 ? median(sold) : sold.length === 1 ? (sold[0] + (median(poolBases) ?? sold[0])) / 2 : (median(poolBases) ?? globalMedianBase ?? floor);
    expectedPrice[cell] = round2(Math.max(floorPrice[cell], exp ?? floor));
    const ratings = pool.map((p) => p.overall).filter((x): x is number => typeof x === "number");
    expectedRating[cell] = ratings.length ? round2(median(ratings) as number) : null;
  }
  return {
    available,
    floorPrice,
    expectedPrice,
    expectedRating,
    supply,
    soldCount: allSold.length,
    avgSoldPrice: allSold.length ? round2(mean(allSold) as number) : null,
    globalFloor: round2(globalFloor),
  };
}

export function reserveFor(evaluation: RuleEvaluation, market: Omit<MarketStats, "demand">, strategy: Strategy | "floor" | "expected") {
  const priceOf = (cell: Cell | "ANY") => {
    const floor = cell === "ANY" ? market.globalFloor : market.floorPrice[cell];
    const exp =
      cell === "ANY"
        ? Math.max(market.globalFloor, Math.min(...ALL_CELLS.map((c) => market.expectedPrice[c])))
        : market.expectedPrice[cell];
    switch (strategy) {
      case "floor":
      case "aggressive":
        return floor;
      case "balanced":
        return (floor + exp) / 2;
      default:
        return exp;
    }
  };
  let r = 0;
  for (const c of evaluation.mandatoryPlan) r += priceOf(c);
  r += evaluation.flexSlots * priceOf("ANY");
  return round2(r);
}

function projectRating(evaluation: RuleEvaluation, rating: TeamRating, market: Omit<MarketStats, "demand">) {
  const fallback = mean(market.available.map((p) => p.overall).filter((x): x is number => typeof x === "number"));
  let total = rating.total;
  let n = rating.count;
  for (const c of evaluation.mandatoryPlan) {
    const e = market.expectedRating[c] ?? fallback;
    if (e !== null) {
      total += e;
      n++;
    }
  }
  if (evaluation.flexSlots && fallback !== null) {
    total += fallback * evaluation.flexSlots;
    n += evaluation.flexSlots;
  }
  return { projectedTotal: round2(total), projectedAverage: n ? round2(total / n) : null };
}

export function analyseTeam(
  rules: RuleSet,
  team: Team,
  entries: RosterEntry[],
  market: Omit<MarketStats, "demand">,
  purseOverride?: number,
): TeamAnalysis {
  const players = entries.map((e) => e.player);
  const prices = entries.map((e) => e.price);
  const initialPurse = Number(purseOverride ?? team.initial_purse);
  const spent = round2(prices.reduce((a, b) => a + b, 0));
  const remaining = round2(initialPurse - spent);
  const evaluation = evaluateRules(rules, players);
  const rating = rateTeam(rules, evaluation, players);
  const floorReserve = reserveFor(evaluation, market, "floor");
  const expectedReserve = reserveFor(evaluation, market, "expected");
  const { projectedAverage, projectedTotal } = projectRating(evaluation, rating, market);
  const firstCellFloor = evaluation.mandatoryPlan[0] ? market.floorPrice[evaluation.mandatoryPlan[0]] : market.globalFloor;
  const maxSingleBid =
    evaluation.slotsRemaining === 0
      ? 0
      : round2(Math.max(0, remaining - (evaluation.slotsRequired > 0 ? floorReserve - firstCellFloor : 0)));
  const purseSufficient = remaining + 1e-9 >= floorReserve;
  if (!purseSufficient) {
    evaluation.alerts.unshift({
      level: "critical",
      kind: "purse",
      message: `Remaining purse (${round2(remaining)}) is insufficient to complete the mandatory squad (needs at least ${floorReserve}).`,
    });
  }
  if (remaining < 0) {
    evaluation.alerts.unshift({ level: "critical", kind: "purse", message: `Purse overspent by ${round2(-remaining)}.` });
  }
  return {
    team,
    entries,
    players,
    initialPurse,
    spent,
    remaining,
    utilization: initialPurse ? spent / initialPurse : 0,
    avgPrice: prices.length ? round2(spent / prices.length) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    minPrice: prices.length ? Math.min(...prices) : null,
    rules: evaluation,
    rating,
    official: officialMetric(rules, rating),
    floorReserve,
    expectedReserve,
    discretionary: round2(remaining - floorReserve),
    purseSufficient,
    projectedAverage,
    projectedTotal,
    maxSingleBid,
    overseasCount: players.filter((p) => p.origin === "overseas").length,
    indianCount: players.filter((p) => p.origin === "indian").length,
    hasEstimates: entries.some((e) => e.source !== "official"),
  };
}

function rankBy<T>(rows: T[], value: (r: T) => number | null, eligible: (r: T) => boolean = () => true) {
  const sorted = [...rows].sort((a, b) => {
    const ea = eligible(a) ? 1 : 0;
    const eb = eligible(b) ? 1 : 0;
    if (ea !== eb) return eb - ea;
    const va = value(a);
    const vb = value(b);
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
  if (t.rules.hasViolation || t.remaining < -1e-9) return false;
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
  for (const t of teams) for (const c of t.rules.mandatoryPlan) demand[c]++;
  const market: MarketStats = { ...base, demand };
  return {
    rules: s.rules,
    teams,
    byId: Object.fromEntries(teams.map((t) => [t.team.id, t])),
    market,
    leaderboard: buildLeaderboard(s.rules, teams),
  };
}
