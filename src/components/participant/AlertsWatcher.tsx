"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { diffAlerts, type EventAnalysis } from "@/lib/engine";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { nameKey } from "@/lib/data/liveEntry";

/** Watches every official update and raises the participant's configured alerts. */
export function AlertsWatcher() {
  const { analysis, myTeamId, session, event, userId } = useEventData();
  const { alertPrefs, ready, shortlist, updateShortlist } = useWorkspace();
  const { players } = useEventData();
  const prevPlayers = useRef<Map<string, string> | null>(null);
  const prev = useRef<{ a: EventAnalysis; cur: string | null } | null>(null);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!myTeamId || !ready || !event || !analysis.teams.length) return;
    const cur = session?.current_player_id ?? null;
    if (prev.current && analysis.teams.length) {
      const alerts = diffAlerts(prev.current.a, analysis, myTeamId, alertPrefs, { prev: prev.current.cur, next: cur });
      const fresh = alerts.filter((a) => !seen.current.has(a.key));
      fresh.forEach((a) => seen.current.add(a.key));
      for (const a of fresh) {
        const fn = a.level === "critical" ? toast.error : a.level === "warning" ? toast.warning : a.level === "success" ? toast.success : toast.info;
        fn(a.title, { description: a.body });
        if (alertPrefs.browser && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          new Notification(a.title, { body: a.body });
        }
      }
      if (fresh.length && userId) {
        void supabaseBrowser()
          .from("notifications")
          .insert(fresh.map((a) => ({ user_id: userId, event_id: event.id, level: a.level, kind: "alert", title: a.title, body: a.body })));
      }
    }
    prev.current = { a: analysis, cur };
  }, [analysis, myTeamId, alertPrefs, ready, session?.current_player_id, event, userId]);
  // Shortlist alerts: a watched player is entered (by name) or a shortlisted player is sold.
  useEffect(() => {
    if (!ready || !players.length) return;
    const now = new Map(players.map((p) => [p.id, p.auction_status]));
    const before = prevPlayers.current;
    prevPlayers.current = now;
    if (!before) return;
    for (const p of players) {
      const was = before.get(p.id);
      const entry = shortlist.find((s) => s.player_id === p.id || (!s.player_id && s.player_name && nameKey(s.player_name) === nameKey(p.name)));
      if (!entry) continue;
      if (!entry.player_id) void updateShortlist(entry.id, { player_id: p.id });
      const key = `sl-${p.id}-${p.auction_status}`;
      if (seen.current.has(key)) continue;
      if (was === undefined) {
        seen.current.add(key);
        toast.info(`Shortlisted player entered: ${p.name}`, { description: p.auction_status === "sold" ? "Already sold." : `Rating ${p.overall ?? "not recorded"}.` });
      } else if (was !== "sold" && p.auction_status === "sold") {
        seen.current.add(key);
        toast.warning(`Shortlisted player sold: ${p.name}`, { description: `${entry.list === "avoid" ? "(on your avoid list) " : ""}Price ${p.sold_price}.` });
        if (alertPrefs.browser && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) new Notification(`Shortlisted player sold: ${p.name}`);
      }
    }
  }, [players, shortlist, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
