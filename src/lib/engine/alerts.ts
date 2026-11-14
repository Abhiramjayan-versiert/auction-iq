import type { EventAnalysis } from "./analysis";

export interface AlertPrefs {
  competitorPurseThreshold: number; // alert when a competitor's remaining purse drops below this
  highRatedThreshold: number; // alert when a player rated >= this is sold
  competitorCompletes: boolean;
  competitorViolations: boolean;
  ownPurse: boolean;
  newPlayer: boolean;
  leaderboard: boolean;
  opportunities: boolean;
  browser: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  competitorPurseThreshold: 10,
  highRatedThreshold: 9,
  competitorCompletes: true,
  competitorViolations: true,
  ownPurse: true,
  newPlayer: true,
  leaderboard: true,
  opportunities: true,
  browser: false,
};

export interface LiveAlert {
  key: string;
  level: "critical" | "warning" | "info" | "success";
  title: string;
  body: string;
}

/** Diff two analyses and emit alerts according to the participant's preferences. */
export function diffAlerts(
  prev: EventAnalysis,
  next: EventAnalysis,
  myTeamId: string,
  prefs: AlertPrefs,
  currentPlayerId?: { prev: string | null; next: string | null },
): LiveAlert[] {
  const out: LiveAlert[] = [];
  const unit = next.rules.currency;
  const nm = (id: string) => next.byId[id]?.team.short_name || next.byId[id]?.team.name || "Team";
  for (const t of next.teams) {
    const p = prev.byId[t.team.id];
    if (!p) continue;
    const isMe = t.team.id === myTeamId;
    // new purchases
    const prevIds = new Set(p.players.map((x) => x.id));
    for (const e of t.entries) {
      if (prevIds.has(e.player.id) || e.source !== "official") continue;
      if ((e.player.overall ?? 0) >= prefs.highRatedThreshold) {
        out.push({ key: `hr-${e.player.id}`, level: "info", title: "High-rated player sold", body: `${e.player.name} (${e.player.overall}) → ${nm(t.team.id)} for ${e.price} ${unit}.` });
      }
    }
    if (!isMe) {
      if (prefs.competitorPurseThreshold > 0 && p.remaining >= prefs.competitorPurseThreshold && t.remaining < prefs.competitorPurseThreshold) {
        out.push({ key: `purse-${t.team.id}-${t.remaining}`, level: "info", title: "Competitor purse low", body: `${nm(t.team.id)} is down to ${t.remaining} ${unit}.` });
      }
      if (prefs.competitorCompletes) {
        const prevDone = new Set(p.rules.statuses.filter((s) => s.state === "satisfied" && s.constraint.min).map((s) => s.constraint.id));
        for (const s of t.rules.statuses) {
          if (s.constraint.min && s.state === "satisfied" && !prevDone.has(s.constraint.id)) {
            out.push({ key: `done-${t.team.id}-${s.constraint.id}`, level: "info", title: "Competitor filled a requirement", body: `${nm(t.team.id)} completed "${s.constraint.label}".` });
          }
        }
      }
      if (prefs.competitorViolations && t.rules.hasViolation && !p.rules.hasViolation) {
        out.push({ key: `viol-${t.team.id}`, level: "warning", title: "Competitor rule violation", body: `${nm(t.team.id)} now violates the auction rules.` });
      }
    } else if (prefs.ownPurse) {
      if (p.purseSufficient && !t.purseSufficient) {
        out.push({ key: `own-insuff`, level: "critical", title: "Insufficient purse", body: `Your purse (${t.remaining} ${unit}) can no longer cover the mandatory squad (${t.floorReserve} ${unit}).` });
      } else if (t.initialPurse && t.remaining / t.initialPurse < 0.15 && p.remaining / p.initialPurse >= 0.15) {
        out.push({ key: `own-low`, level: "warning", title: "Purse nearly exhausted", body: `Only ${t.remaining} ${unit} left.` });
      }
    }
  }
  if (prefs.leaderboard) {
    const before = prev.leaderboard.find((r) => r.teamId === myTeamId)?.officialRank;
    const after = next.leaderboard.find((r) => r.teamId === myTeamId)?.officialRank;
    if (before && after && after > before) out.push({ key: `lb-${after}`, level: "warning", title: "Leaderboard position lost", body: `You dropped from #${before} to #${after}.` });
    if (before && after && after < before) out.push({ key: `lb-${after}`, level: "success", title: "Moved up the leaderboard", body: `You climbed from #${before} to #${after}.` });
  }
  if (prefs.newPlayer && currentPlayerId && currentPlayerId.next && currentPlayerId.next !== currentPlayerId.prev) {
    out.push({ key: `cur-${currentPlayerId.next}`, level: "info", title: "New player on the block", body: "A new player is now up for auction." });
  }
  return out;
}
