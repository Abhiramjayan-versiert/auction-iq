"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Settings() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<{ key: string; value: unknown }[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [notif, setNotif] = useState({ title: "", body: "" });
  const load = useCallback(async () => {
    const { data } = await sb.from("platform_settings").select("*").order("key");
    setRows(data ?? []);
    setDraft(Object.fromEntries((data ?? []).map((r) => [r.key, JSON.stringify(r.value, null, 2)])));
  }, [sb]);
  useEffect(() => void load(), [load]);
  const save = async (key: string) => {
    let value: unknown;
    try {
      value = JSON.parse(draft[key]);
    } catch {
      return toast.error("Value must be valid JSON");
    }
    const { error } = await sb.from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success(`${key} saved`);
    await load();
  };
  const broadcast = async () => {
    const { error } = await sb.from("notifications").insert({ level: "info", kind: "system", title: notif.title, body: notif.body || null });
    if (error) return toast.error(error.message);
    toast.success("System notification sent to all users");
    setNotif({ title: "", body: "" });
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Global settings" description="Platform-wide defaults applied to new events." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.key}>
              <CardHeader title={<span className="font-mono break-all">{r.key}</span>} action={<Button size="sm" variant="secondary" onClick={() => save(r.key)}>Save</Button>} />
              <CardBody><Textarea className="min-h-20 font-mono text-xs" value={draft[r.key] ?? ""} onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })} /></CardBody>
            </Card>
          ))}
          <Card className="p-4"><div className="flex gap-2"><Input className="font-mono" placeholder="new_setting_key" value={newKey} onChange={(e) => setNewKey(e.target.value)} /><Button variant="secondary" disabled={!newKey} onClick={async () => { setDraft({ ...draft, [newKey]: "null" }); await sb.from("platform_settings").insert({ key: newKey, value: null }); setNewKey(""); await load(); }}>Add</Button></div></Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="System notification" description="Broadcast to every user" />
            <CardBody className="space-y-2">
              <Field label="Title"><Input value={notif.title} onChange={(e) => setNotif({ ...notif, title: e.target.value })} /></Field>
              <Field label="Message"><Textarea value={notif.body} onChange={(e) => setNotif({ ...notif, body: e.target.value })} /></Field>
              <Button disabled={!notif.title} onClick={broadcast}>Send</Button>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Integrations" />
            <CardBody className="space-y-2 text-sm text-muted">
              <p><b className="text-fg">Supabase</b> — database, auth (email + Google), realtime. Required.</p>
              <p><b className="text-fg">Google OAuth</b> — enable the Google provider in Supabase Auth settings and add the callback URL.</p>
              <p><b className="text-fg">Optional AI narration</b> — the intelligence engine is fully deterministic. An LLM can optionally rephrase insights; set ANTHROPIC_API_KEY on the server to enable it in future releases.</p>
              <p><b className="text-fg">Subscriptions / access plans</b> — not enabled. Add a platform setting if introduced.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
