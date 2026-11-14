"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { diffAlerts, type EventAnalysis } from "@/lib/engine";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";

/** Watches every official update and raises the participant's configured alerts. */
export function AlertsWatcher() {
  const { analysis, myTeamId, session, event, userId } = useEventData();
  const { alertPrefs, ready } = useWorkspace();
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
  return null;
}
