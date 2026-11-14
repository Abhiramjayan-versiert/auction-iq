import { analyseEvent, type EventAnalysis } from "./analysis";
import type { EventSnapshot, RosterEntry } from "./types";

export interface Hypothetical {
  id: string;
  player_id: string;
  team_id: string;
  price: number;
}

/** Apply private hypothetical purchases on top of the official snapshot. Never mutates the input. */
export function simulate(snapshot: EventSnapshot, hyps: Hypothetical[]): EventAnalysis {
  const players = new Map(snapshot.players.map((p) => [p.id, p]));
  const extra: Record<string, RosterEntry[]> = {};
  for (const [k, v] of Object.entries(snapshot.extraEntries ?? {})) extra[k] = [...v];
  const used = new Set<string>();
  for (const h of hyps) {
    const p = players.get(h.player_id);
    if (!p || used.has(p.id) || p.auction_status === "sold") continue;
    used.add(p.id);
    (extra[h.team_id] ??= []).push({ player: p, price: Number(h.price), source: "estimated" });
  }
  return analyseEvent({ ...snapshot, extraEntries: extra });
}
