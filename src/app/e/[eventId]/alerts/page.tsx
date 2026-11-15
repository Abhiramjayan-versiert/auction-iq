"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { type AlertPrefs } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Switch } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/types/db";
import { fmtDate } from "@/lib/utils";

export default function Alerts() {
  const { event, userId, rules } = useEventData();
  const { alertPrefs, setAlertPrefs } = useWorkspace();
  const [p, setP] = useState<AlertPrefs>(alertPrefs);
  const [history, setHistory] = useState<NotificationRow[]>([]);
  useEffect(() => {
    setP(alertPrefs);
  }, [alertPrefs]);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("notifications").select("*").eq("event_id", event!.id).or(`user_id.eq.${userId},user_id.is.null`).order("created_at", { ascending: false }).limit(100);
    setHistory((data ?? []) as NotificationRow[]);
  }, [event, userId]);
  useEffect(() => void load(), [load]);
  const save = async () => {
    if (p.browser && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast.error("Browser notifications were blocked"); p.browser = false; }
    }
    await setAlertPrefs(p);
    toast.success("Alert preferences saved");
  };
  const sw = (k: keyof AlertPrefs, label: string) => <Switch checked={Boolean(p[k])} onChange={(v) => setP({ ...p, [k]: v })} label={label} />;
  return (
    <div className="space-y-4">
      <PageHeader title="Alerts" description="Choose what you want to be told about during the auction." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Preferences" />
          <CardBody className="space-y-3">
            <Field label={`Competitor purse drops below (${rules.currency})`}><Input type="number" step="0.5" value={p.competitorPurseThreshold} onChange={(e) => setP({ ...p, competitorPurseThreshold: Number(e.target.value) })} /></Field>
            <Field label="High-rated player sold (rating ≥)"><Input type="number" step="0.1" value={p.highRatedThreshold} onChange={(e) => setP({ ...p, highRatedThreshold: Number(e.target.value) })} /></Field>
            <div className="flex flex-col gap-2.5">
              {sw("competitorCompletes", "Competitor completes a required category")}
              {sw("competitorViolations", "Competitor violates a rule")}
              {sw("ownPurse", "My purse nearly exhausted / insufficient for mandatory squad")}
              {sw("newPlayer", "New player on the block")}
              {sw("leaderboard", "I lose or gain leaderboard position")}
              {sw("opportunities", "Strategic opportunities")}
              {sw("browser", "Also show browser notifications (when tab is hidden)")}
            </div>
            <Button onClick={save} className="w-full">Save preferences</Button>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Alert history" action={<Button size="sm" variant="ghost" onClick={load}>Refresh</Button>} />
          <CardBody>
            <ul className="divide-y divide-line/40">
              {history.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-2 text-sm">
                  <Badge tone={n.level === "critical" ? "danger" : n.level === "warning" ? "warn" : n.level === "success" ? "ok" : "info"}>{n.level}</Badge>
                  <div className="min-w-0 flex-1"><div className="font-medium">{n.title}</div>{n.body && <div className="text-xs text-muted">{n.body}</div>}</div>
                  <span className="shrink-0 text-[11px] text-faint">{n.user_id ? "personal" : "event"} · {fmtDate(n.created_at)}</span>
                </li>
              ))}
              {!history.length && <li className="py-6 text-center text-xs text-muted">No alerts yet.</li>}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
