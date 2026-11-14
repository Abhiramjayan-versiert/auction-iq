"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function NewTracker() {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [tpls, setTpls] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [f, setF] = useState({ name: "", myTeam: "", competitors: "", purse: "100", currency: "Cr", template: "", squadMin: "", squadMax: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void sb.from("rule_templates").select("id, name, description").order("name").then(({ data }) => setTpls(data ?? []));
  }, [sb]);
  const competitors = f.competitors.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await sb.rpc("create_tracker", {
      p_name: f.name, p_my_team: f.myTeam, p_competitors: competitors, p_purse: Number(f.purse), p_currency: f.currency,
      p_template: f.template || null, p_squad_min: f.squadMin ? Number(f.squadMin) : null, p_squad_max: f.squadMax ? Number(f.squadMax) : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Tracker created");
    router.push(`/e/${data}/crew?new=1`);
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New auction tracker"
        description="For an auction run outside AUCTION IQ: one crew member enters the results, and your whole crew gets live purse maths, competitor intelligence and Smart Bid on their own devices."
      />
      <form onSubmit={create} className="space-y-4">
        <Card>
          <CardHeader title="1 · The auction" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Tracker name" className="sm:col-span-2"><Input required value={f.name} onChange={set("name")} placeholder="YAMISTHA 2026 IPL Auction" /></Field>
            <Field label="Purse per team"><Input type="number" step="0.5" min="0" required value={f.purse} onChange={set("purse")} /></Field>
            <Field label="Currency label"><Input value={f.currency} onChange={set("currency")} /></Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="2 · Teams" description="Your team plus every competitor you want to track. You can add or edit teams later." />
          <CardBody className="grid gap-3">
            <Field label="Your team"><Input required value={f.myTeam} onChange={set("myTeam")} placeholder="Chennai Super Kings" /></Field>
            <Field label={`Competitor teams (${competitors.length})`} hint="One per line, or comma separated">
              <Textarea className="min-h-32" value={f.competitors} onChange={set("competitors")} placeholder={"Mumbai Indians\nRoyal Challengers\nKolkata Knight Riders"} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="3 · Rules" description="Pick the format your auction uses. Every rule can be edited later." />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <Field label="Rule template" className="sm:col-span-3">
              <Select value={f.template} onChange={set("template")}>
                <option value="">No template — I&apos;ll set rules myself</option>
                {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            {!f.template && (
              <>
                <Field label="Min squad size"><Input type="number" min="1" value={f.squadMin} onChange={set("squadMin")} placeholder="9" /></Field>
                <Field label="Max squad size"><Input type="number" min="1" value={f.squadMax} onChange={set("squadMax")} placeholder="9" /></Field>
              </>
            )}
            {f.template && <p className="text-xs text-muted sm:col-span-3">{tpls.find((t) => t.id === f.template)?.description}</p>}
          </CardBody>
        </Card>
        <div className="flex justify-end"><Button size="lg" disabled={busy}>{busy ? "Creating…" : "Create tracker"}</Button></div>
        <p className="text-xs text-faint">Next you&apos;ll add players (type them in or import your Excel sheet) and invite your crew with a private code.</p>
      </form>
    </div>
  );
}
