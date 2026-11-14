"use client";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Dialog, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TeamChip } from "@/components/domain/team";
import { useEventData } from "@/hooks/useEventData";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { TeamRow } from "@/lib/types/db";

const COLORS = ["#a3e635", "#facc15", "#60a5fa", "#f472b6", "#f97316", "#a78bfa", "#34d399", "#f87171", "#22d3ee", "#e879f9"];

export default function Teams() {
  const { event, teamRows, analysis, rules, reload, teamMembers } = useEventData();
  const sb = supabaseBrowser();
  const [f, setF] = useState({ name: "", short_name: "", initial_purse: String(event!.default_purse), color: COLORS[teamRows.length % COLORS.length], logo_url: "" });
  const [bulk, setBulk] = useState("");
  const [edit, setEdit] = useState<TeamRow | null>(null);
  const m = (n: number) => fmtMoney(n, rules.currency);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await sb.from("teams").insert({ event_id: event!.id, name: f.name.trim(), short_name: f.short_name.trim() || null, initial_purse: Number(f.initial_purse), color: f.color, logo_url: f.logo_url || null });
    if (error) return toast.error(error.message);
    setF({ ...f, name: "", short_name: "", logo_url: "", color: COLORS[(teamRows.length + 1) % COLORS.length] });
    await reload();
  };
  const addBulk = async () => {
    const names = bulk.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const rows = names.map((line, i) => {
      const [name, short, purse] = line.split(/[,\t]/).map((s) => s.trim());
      return { event_id: event!.id, name, short_name: short || null, initial_purse: Number(purse || event!.default_purse), color: COLORS[(teamRows.length + i) % COLORS.length] };
    });
    const { error } = await sb.from("teams").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} teams added`);
    setBulk("");
    await reload();
  };
  const remove = async (t: TeamRow) => {
    if (analysis.byId[t.id]?.rating.count) return toast.error("This team has purchases. Undo or void them first.");
    if (!confirm(`Delete ${t.name}?`)) return;
    const { error } = await sb.from("teams").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    await reload();
  };
  const saveEdit = async () => {
    if (!edit) return;
    const { error } = await sb.from("teams").update({ name: edit.name, short_name: edit.short_name, initial_purse: Number(edit.initial_purse), color: edit.color, logo_url: edit.logo_url }).eq("id", edit.id);
    if (error) return toast.error(error.message);
    toast.success("Team updated — purse recalculated from transactions");
    setEdit(null);
    await reload();
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Teams" description={`${teamRows.length} teams · supports 40+ per event`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="All teams" />
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead><tr className="text-left text-[11px] uppercase text-faint"><th>Team</th><th className="text-right">Initial purse</th><th className="text-right">Remaining</th><th className="text-right">Players</th><th>Owner</th><th /></tr></thead>
              <tbody>
                {teamRows.map((t) => (
                  <tr key={t.id} className="border-t border-line/40">
                    <td className="py-1.5"><TeamChip team={t} /> <span className="text-xs text-faint">{t.name !== t.short_name ? t.name : ""}</span></td>
                    <td className="text-right">{m(Number(t.initial_purse))}</td>
                    <td className="text-right">{m(analysis.byId[t.id]?.remaining ?? 0)}</td>
                    <td className="text-right">{analysis.byId[t.id]?.rating.count ?? 0}</td>
                    <td className="text-xs">{teamMembers.some((x) => x.team_id === t.id && x.role === "owner") ? "assigned" : <span className="text-faint">open</span>}</td>
                    <td className="text-right">
                      <button onClick={() => setEdit(t)} className="mr-2 text-faint hover:text-fg cursor-pointer" aria-label="Edit"><Pencil size={13} /></button>
                      <button onClick={() => remove(t)} className="text-faint hover:text-danger cursor-pointer" aria-label="Delete"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
                {!teamRows.length && <tr><td colSpan={6} className="py-6 text-center text-xs text-muted">No teams yet.</td></tr>}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Add team" />
            <CardBody>
              <form onSubmit={add} className="grid grid-cols-2 gap-2">
                <Field label="Name" className="col-span-2"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Chennai Super Kings" /></Field>
                <Field label="Short name"><Input value={f.short_name} onChange={(e) => setF({ ...f, short_name: e.target.value })} placeholder="CSK" /></Field>
                <Field label={`Purse (${rules.currency})`}><Input type="number" step="0.5" required value={f.initial_purse} onChange={(e) => setF({ ...f, initial_purse: e.target.value })} /></Field>
                <Field label="Colour"><Input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="p-1" /></Field>
                <Field label="Logo URL"><Input value={f.logo_url} onChange={(e) => setF({ ...f, logo_url: e.target.value })} placeholder="https://…" /></Field>
                <Button className="col-span-2">Add team</Button>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Bulk add" description="One per line: name, short name, purse" />
            <CardBody className="space-y-2">
              <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Mumbai Indians, MI, 100\nRoyal Challengers, RCB"} className="min-h-28 font-mono text-xs" />
              <Button variant="secondary" className="w-full" onClick={addBulk}>Add all</Button>
            </CardBody>
          </Card>
        </div>
      </div>
      {edit && (
        <Dialog open onClose={() => setEdit(null)} title={`Edit ${edit.name}`}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" className="col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Short name"><Input value={edit.short_name ?? ""} onChange={(e) => setEdit({ ...edit, short_name: e.target.value })} /></Field>
            <Field label="Initial purse"><Input type="number" step="0.5" value={edit.initial_purse} onChange={(e) => setEdit({ ...edit, initial_purse: Number(e.target.value) })} /></Field>
            <Field label="Colour"><Input type="color" value={edit.color ?? "#a3e635"} onChange={(e) => setEdit({ ...edit, color: e.target.value })} className="p-1" /></Field>
            <Field label="Logo URL"><Input value={edit.logo_url ?? ""} onChange={(e) => setEdit({ ...edit, logo_url: e.target.value })} /></Field>
            <div className="col-span-2 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={saveEdit}>Save</Button></div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
