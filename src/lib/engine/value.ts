import type { EventAnalysis } from "./analysis";
import { round2 } from "./money";
import { cellAllowed, cellOf } from "./rules";
import type { Player } from "./types";

export interface PlayerValue {
  player: Player;
  price: number; // winning price for sold players, base price otherwise
  efficiency: number | null; // rating / price
  valueIndex: number | null; // 0..100 within category
  improvement: number | null; // change in my team average if bought
  fitsNeeds: boolean;
  allowed: boolean;
}

export function playerValues(a: EventAnalysis, players: Player[], myTeamId?: string): PlayerValue[] {
  const me = myTeamId ? a.byId[myTeamId] : undefined;
  const rows = players.map((p) => {
    const price = Number(p.auction_status === "sold" && p.sold_price ? p.sold_price : p.base_price);
    const efficiency = p.overall !== null && price > 0 ? p.overall / price : null;
    let improvement: number | null = null;
    let fitsNeeds = false;
    let allowed = true;
    if (me && p.overall !== null) {
      const n = me.rating.count;
      const newAvg = (me.rating.total + p.overall) / (n + 1);
      improvement = round2(newAvg - (me.rating.average ?? 0));
      if (n === 0) improvement = round2(newAvg);
      fitsNeeds = me.rules.mandatoryPlan.includes(cellOf(p));
      allowed = cellAllowed(a.rules, me.rules.cellCounts, cellOf(p)).ok;
    }
    return { player: p, price, efficiency, valueIndex: null as number | null, improvement, fitsNeeds, allowed };
  });
  // normalise efficiency to 0..100 within each primary category (log scale: prices span orders of magnitude)
  const byCat = new Map<string, PlayerValue[]>();
  for (const r of rows) {
    if (r.efficiency === null) continue;
    const list = byCat.get(r.player.category) ?? [];
    list.push(r);
    byCat.set(r.player.category, list);
  }
  for (const list of byCat.values()) {
    const logs = list.map((r) => Math.log(r.efficiency as number));
    const lo = Math.min(...logs);
    const hi = Math.max(...logs);
    list.forEach((r, i) => (r.valueIndex = hi - lo < 1e-9 ? 50 : round2(((logs[i] - lo) / (hi - lo)) * 100)));
  }
  return rows;
}
