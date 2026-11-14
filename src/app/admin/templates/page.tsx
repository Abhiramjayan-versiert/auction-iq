"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Tpl { id: string; name: string; description: string | null; config: unknown }

const EXAMPLE = JSON.stringify({ rules: { squad_min: 11, squad_max: 15, bid_increment: 0.25, ranking_formula: "average", require_complete_squad: true }, constraints: [{ label: "Overseas players", category: null, origin: "overseas", min: null, max: 4 }, { label: "Wicketkeepers", category: "WK", origin: null, min: 1, max: null }] }, null, 2);

export default function Templates() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Tpl[]>([]);
  const [f, setF] = useState({ id: "", name: "", description: "", config: EXAMPLE });
  const load = useCallback(async () => {
    const { data } = await sb.from("rule_templates").select("*").order("name");
    setRows((data ?? []) as Tpl[]);
  }, [sb]);
  useEffect(() => void load(), [load]);
  const save = async () => {
    let config: unknown;
    try {
      config = JSON.parse(f.config);
    } catch {
      return toast.error("Config is not valid JSON");
    }
    const c = config as { rules?: unknown; constraints?: unknown };
    if (!c.rules || !Array.isArray(c.constraints)) return toast.error("Config needs { rules: {...}, constraints: [...] }");
    const body = { name: f.name, description: f.description || null, config };
    const { error } = f.id ? await sb.from("rule_templates").update(body).eq("id", f.id) : await sb.from("rule_templates").insert(body);
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setF({ id: "", name: "", description: "", config: EXAMPLE });
    await load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete template?")) return;
    await sb.from("rule_templates").delete().eq("id", id);
    await load();
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Rule templates" description="Reusable auction formats auctioneers can load into any event." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {rows.map((t) => {
            const c = t.config as { constraints?: unknown[]; rules?: Record<string, unknown> };
            return (
              <Card key={t.id} className="p-4">
                <div className="flex justify-between gap-2"><div className="font-semibold">{t.name}</div><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setF({ id: t.id, name: t.name, description: t.description ?? "", config: JSON.stringify(t.config, null, 2) })}>Edit</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => remove(t.id)}>Delete</Button></div></div>
                <p className="mt-1 text-xs text-muted">{t.description}</p>
                <div className="mt-2 flex gap-1"><Badge>squad {String(c.rules?.squad_min)}–{String(c.rules?.squad_max)}</Badge><Badge>{c.constraints?.length ?? 0} constraints</Badge></div>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardHeader title={f.id ? "Edit template" : "New template"} />
          <CardBody className="space-y-2">
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Config (JSON)" hint="category: BAT | BOWL | AR | WK | null · origin: indian | overseas | null"><Textarea className="min-h-72 font-mono text-xs" value={f.config} onChange={(e) => setF({ ...f, config: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">{f.id && <Button variant="ghost" onClick={() => setF({ id: "", name: "", description: "", config: EXAMPLE })}>Cancel</Button>}<Button onClick={save} disabled={!f.name}>Save template</Button></div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
