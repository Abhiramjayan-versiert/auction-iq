"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, CATEGORY_LABEL, DEFAULT_WEIGHTS, FORMULA_LABEL, evaluateRules, type Weights } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useEventData } from "@/hooks/useEventData";
import { rpc } from "@/lib/data/rpc";
import { supabaseBrowser } from "@/lib/supabase/client";

interface C { label: string; category: string; origin: string; min: string; max: string }
interface Tpl { id: string; name: string; description: string | null; config: { rules: Record<string, unknown>; constraints: { label: string; category: string | null; origin: string | null; min: number | null; max: number | null }[] } }

export default function Rules() {
  const { event, rules, reload, transactions } = useEventData();
  const [canEdit, setCanEdit] = useState(false);
  const [r, setR] = useState({ squad_min: "", squad_max: "", min_player_price: "", bid_increment: "", rating_scale_max: "", ranking_formula: "average", require_complete_squad: true, enforce_max_constraints: true, allow_overspend: false });
  const [w, setW] = useState<Weights>(DEFAULT_WEIGHTS);
  const [cs, setCs] = useState<C[]>([]);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  useEffect(() => {
    const sb = supabaseBrowser();
    void sb.rpc("can_edit_rules", { p_event: event!.id }).then(({ data }) => setCanEdit(Boolean(data)));
    void sb.from("rule_templates").select("*").order("name").then(({ data }) => setTpls((data ?? []) as Tpl[]));
    void sb.from("auction_rules").select("*").eq("event_id", event!.id).single().then(({ data }) => {
      if (!data) return;
      setR({ squad_min: String(data.squad_min), squad_max: String(data.squad_max), min_player_price: data.min_player_price == null ? "" : String(data.min_player_price), bid_increment: String(data.bid_increment), rating_scale_max: String(data.rating_scale_max), ranking_formula: data.ranking_formula, require_complete_squad: data.require_complete_squad, enforce_max_constraints: data.enforce_max_constraints, allow_overspend: data.allow_overspend });
    });
  }, [event]);
  useEffect(() => {
    setW(rules.weights);
    setCs(rules.constraints.map((c) => ({ label: c.label, category: c.category ?? "", origin: c.origin ?? "", min: c.min == null ? "" : String(c.min), max: c.max == null ? "" : String(c.max) })));
  }, [rules]);
  const applyTpl = (id: string) => {
    const t = tpls.find((x) => x.id === id);
    if (!t) return;
    const tr = t.config.rules ?? {};
    setR((s) => ({ ...s, ...Object.fromEntries(Object.entries(tr).map(([k, v]) => [k, typeof v === "boolean" ? v : String(v)])) }));
    setCs(t.config.constraints.map((c) => ({ label: c.label, category: c.category ?? "", origin: c.origin ?? "", min: c.min == null ? "" : String(c.min), max: c.max == null ? "" : String(c.max) })));
    toast.info(`Loaded template "${t.name}" — review and save.`);
  };
  // Sanity check: is the configured rule set satisfiable at all?
  const draftRules = { ...rules, squad_min: Number(r.squad_min) || 0, squad_max: Number(r.squad_max) || 0, constraints: cs.map((c, i) => ({ id: String(i), label: c.label, category: (c.category || null) as never, origin: (c.origin || null) as never, min: c.min === "" ? null : Number(c.min), max: c.max === "" ? null : Number(c.max) })) };
  const check = evaluateRules(draftRules, []);
  const save = async () => {
    if (Number(r.squad_min) > Number(r.squad_max)) return toast.error("Minimum squad cannot exceed maximum");
    if (transactions.some((t) => t.status === "active") && !confirm("Sales have already been recorded. Changing rules affects validity for every team. Continue?")) return;
    const ok = await rpc("save_event_rules", {
      p_event: event!.id,
      p_rules: { ...r, squad_min: Number(r.squad_min), squad_max: Number(r.squad_max), bid_increment: Number(r.bid_increment), rating_scale_max: Number(r.rating_scale_max), min_player_price: r.min_player_price === "" ? "" : Number(r.min_player_price), weights: w },
      p_constraints: cs.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), category: c.category, origin: c.origin, min: c.min, max: c.max })),
    }, "Rules saved");
    if (ok) await reload();
  };
  const setC = (i: number, k: keyof C, v: string) => setCs(cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const totalW = Object.values(w).reduce((a, b) => a + Number(b), 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Auction rules" description="Configured per event — nothing is hard-coded." actions={<>{!canEdit && <Badge tone="warn">Read-only: rule editing disabled by Super Admin</Badge>}<Select className="w-56" defaultValue="" onChange={(e) => applyTpl(e.target.value)} disabled={!canEdit}><option value="">Load template…</option>{tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select><Button onClick={save} disabled={!canEdit}>Save rules</Button></>} />
      <fieldset disabled={!canEdit} className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Squad & bidding" />
          <CardBody className="grid grid-cols-2 gap-3">
            <Field label="Min squad size"><Input type="number" value={r.squad_min} onChange={(e) => setR({ ...r, squad_min: e.target.value })} /></Field>
            <Field label="Max squad size"><Input type="number" value={r.squad_max} onChange={(e) => setR({ ...r, squad_max: e.target.value })} /></Field>
            <Field label="Bid increment"><Input type="number" step="0.05" value={r.bid_increment} onChange={(e) => setR({ ...r, bid_increment: e.target.value })} /></Field>
            <Field label="Min price per slot" hint="Blank = cheapest base price"><Input type="number" step="0.05" value={r.min_player_price} onChange={(e) => setR({ ...r, min_player_price: e.target.value })} /></Field>
            <Field label="Rating scale max"><Input type="number" step="0.5" value={r.rating_scale_max} onChange={(e) => setR({ ...r, rating_scale_max: e.target.value })} /></Field>
            <div className="col-span-2 space-y-2 pt-1">
              <Switch checked={r.enforce_max_constraints} onChange={(v) => setR({ ...r, enforce_max_constraints: v })} label="Block sales that break a maximum" />
              <Switch checked={r.allow_overspend} onChange={(v) => setR({ ...r, allow_overspend: v })} label="Allow purse overspend" />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Official winning formula" description="Kept separate from analytical scores" />
          <CardBody className="space-y-3">
            <Select value={r.ranking_formula} onChange={(e) => setR({ ...r, ranking_formula: e.target.value })}>
              {(Object.keys(FORMULA_LABEL) as (keyof typeof FORMULA_LABEL)[]).map((k) => <option key={k} value={k}>{FORMULA_LABEL[k]}</option>)}
            </Select>
            <Switch checked={r.require_complete_squad} onChange={(v) => setR({ ...r, require_complete_squad: v })} label="Only complete, valid squads can win" />
            <div className="pt-2 text-xs font-medium text-faint">Analytical weights {totalW !== 100 && <span className="text-warn">(sum {totalW}%, normalised)</span>}</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(w) as (keyof Weights)[]).map((k) => <Field key={k} label={`${k} %`}><Input type="number" value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} /></Field>)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rule check" />
          <CardBody className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted">Minimum players to satisfy all rules</span><b>{check.slotsRequired}</b></div>
            <div className="flex justify-between"><span className="text-muted">Satisfiable within squad size</span><Badge tone={check.feasible ? "ok" : "danger"}>{check.feasible ? "yes" : "no"}</Badge></div>
            <p className="pt-2 text-xs text-muted">Every sale is validated against these constraints in the database. Participants see violations, incomplete requirements and potential future violations live.</p>
          </CardBody>
        </Card>
      </fieldset>
      <Card>
        <CardHeader title="Category constraints" description="Leave category or origin as “Any” to match all. Use min = max for “exactly”." action={canEdit && <Button size="sm" variant="secondary" onClick={() => setCs([...cs, { label: "", category: "", origin: "", min: "", max: "" }])}><Plus size={14} /> Add constraint</Button>} />
        <CardBody>
          <fieldset disabled={!canEdit} className="space-y-2">
            {cs.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_90px_90px_32px]">
                <Input placeholder="Label e.g. Indian bowlers" value={c.label} onChange={(e) => setC(i, "label", e.target.value)} />
                <Select value={c.category} onChange={(e) => setC(i, "category", e.target.value)}><option value="">Any category</option>{CATEGORIES.map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}</Select>
                <Select value={c.origin} onChange={(e) => setC(i, "origin", e.target.value)}><option value="">Any origin</option><option value="indian">Indian</option><option value="overseas">Overseas</option></Select>
                <Input type="number" min="0" placeholder="Min" value={c.min} onChange={(e) => setC(i, "min", e.target.value)} />
                <Input type="number" min="0" placeholder="Max" value={c.max} onChange={(e) => setC(i, "max", e.target.value)} />
                <button onClick={() => setCs(cs.filter((_, j) => j !== i))} className="text-faint hover:text-danger cursor-pointer" aria-label="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
            {!cs.length && <p className="text-xs text-muted">No constraints — only squad size applies.</p>}
          </fieldset>
        </CardBody>
      </Card>
    </div>
  );
}
