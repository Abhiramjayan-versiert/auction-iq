"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Badge, Dialog, PageHeader } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { EventRow, ProfileRow } from "@/lib/types/db";
import { fmtDate } from "@/lib/utils";

type Auc = Pick<ProfileRow, "id" | "full_name" | "email" | "platform_role">;

export function EventsClient({ events, orgs, auctioneers, assignments }: { events: EventRow[]; orgs: { id: string; name: string }[]; auctioneers: Auc[]; assignments: { event_id: string; user_id: string }[] }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [edit, setEdit] = useState<Partial<EventRow> | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const list = events.filter((e) => (!q || e.name.toLowerCase().includes(q.toLowerCase())) && (!status || e.status === status));
  const toggle = async (e: EventRow) => {
    const { error } = await sb.from("events").update({ is_active: !e.is_active }).eq("id", e.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };
  const remove = async (e: EventRow) => {
    if (prompt(`Type the event name to permanently delete "${e.name}" and ALL its teams, players and transactions:`) !== e.name) return;
    const { error } = await sb.from("events").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success("Event deleted");
    router.refresh();
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Events & auctions" description="Each event is fully isolated: its own teams, players, rules, transactions and leaderboard." actions={<Button onClick={() => setEdit({ status: "upcoming", is_active: true, visibility: "public", team_selection: "self_select", requires_approval: false, currency: "Cr", default_purse: 100, auctioneer_can_edit_rules: true })}>Create event</Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 p-3">
          <Input className="max-w-xs" placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{["draft", "upcoming", "live", "completed", "archived"].map((s) => <option key={s}>{s}</option>)}</Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line/70 text-left text-[11px] uppercase text-faint"><th className="px-3 py-2">Event</th><th>Status</th><th>Code</th><th>Auctioneers</th><th>Date</th><th /></tr></thead>
            <tbody>{list.map((e) => {
              const auc = assignments.filter((a) => a.event_id === e.id).map((a) => auctioneers.find((x) => x.id === a.user_id)?.full_name ?? "—");
              return (
                <tr key={e.id} className="border-b border-line/40">
                  <td className="px-3 py-2"><div className="font-medium">{e.name}</div><div className="text-xs text-faint">{e.organizations?.name ?? "No organisation"} · {e.visibility}</div></td>
                  <td>{e.mode === "tracker" && <Badge tone="info" className="mr-1">tracker</Badge>}<Badge tone={e.status === "live" ? "accent" : e.status === "completed" ? "info" : "neutral"}>{e.status}</Badge>{!e.is_active && <Badge tone="danger" className="ml-1">inactive</Badge>}</td>
                  <td className="font-mono text-xs">{e.invite_code}</td>
                  <td className="text-xs">{auc.join(", ") || <span className="text-warn">none</span>}</td>
                  <td className="text-xs text-faint">{fmtDate(e.starts_at)}</td>
                  <td className="pr-3">
                    <span className="flex justify-end gap-1">
                      <Link href={`/manage/${e.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>Manage</Link>
                      <Link href={`/e/${e.id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>Analytics</Link>
                      <Button size="sm" variant="ghost" onClick={() => setEdit(e)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(e)}>{e.is_active ? "Deactivate" : "Activate"}</Button>
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => remove(e)}>Delete</Button>
                    </span>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {!list.length && <p className="py-8 text-center text-xs text-muted">No events.</p>}
        </div>
      </Card>
      {edit && <EventDialog ev={edit} orgs={orgs} auctioneers={auctioneers} assigned={assignments.filter((a) => a.event_id === edit.id).map((a) => a.user_id)} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EventDialog({ ev, orgs, auctioneers, assigned, onClose }: { ev: Partial<EventRow>; orgs: { id: string; name: string }[]; auctioneers: Auc[]; assigned: string[]; onClose: () => void }) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [f, setF] = useState<Partial<EventRow>>({ ...ev, starts_at: ev.starts_at ? ev.starts_at.slice(0, 16) : "" });
  const [newOrg, setNewOrg] = useState("");
  const [auc, setAuc] = useState<string[]>(assigned);
  const perms = f.participant_permissions ?? { view_competitors: true, view_official_purses: true, view_leaderboard: true };
  const save = async () => {
    if (!f.name?.trim()) return toast.error("Name required");
    let organization_id = f.organization_id ?? null;
    if (newOrg.trim()) {
      const { data, error } = await sb.from("organizations").insert({ name: newOrg.trim() }).select("id").single();
      if (error) return toast.error(error.message);
      organization_id = data.id;
    }
    const body = {
      name: f.name.trim(), description: f.description || null, venue: f.venue || null, starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
      status: f.status, is_active: f.is_active, visibility: f.visibility, requires_approval: f.requires_approval, team_selection: f.team_selection,
      currency: f.currency || "Cr", default_purse: Number(f.default_purse ?? 100), auctioneer_can_edit_rules: f.auctioneer_can_edit_rules, participant_permissions: perms, organization_id,
      ...(f.invite_code && f.invite_code !== ev.invite_code ? { invite_code: f.invite_code.toUpperCase() } : {}),
    };
    const res = ev.id ? await sb.from("events").update(body).eq("id", ev.id).select("id").single() : await sb.from("events").insert(body).select("id").single();
    if (res.error) return toast.error(res.error.message);
    const id = res.data.id;
    for (const uid of auc.filter((u) => !assigned.includes(u))) {
      const { error } = await sb.rpc("add_event_auctioneer", { p_event: id, p_user: uid });
      if (error) toast.error(error.message);
    }
    for (const uid of assigned.filter((u) => !auc.includes(u))) await sb.from("event_members").delete().eq("event_id", id).eq("user_id", uid);
    toast.success(ev.id ? "Event updated" : "Event created");
    onClose();
    router.refresh();
  };
  return (
    <Dialog open onClose={onClose} title={ev.id ? `Edit ${ev.name}` : "Create event"} wide>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Event name" className="md:col-span-2"><Input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="YAMISTHA 2026 IPL Auction" /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EventRow["status"] })}>{["draft", "upcoming", "live", "completed", "archived"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Organisation"><Select value={f.organization_id ?? ""} onChange={(e) => setF({ ...f, organization_id: e.target.value || null })}><option value="">None</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="…or new organisation"><Input value={newOrg} onChange={(e) => setNewOrg(e.target.value)} placeholder="College / fest name" /></Field>
        <Field label="Starts at"><Input type="datetime-local" value={f.starts_at ?? ""} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
        <Field label="Venue"><Input value={f.venue ?? ""} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
        <Field label="Currency label"><Input value={f.currency ?? "Cr"} onChange={(e) => setF({ ...f, currency: e.target.value })} /></Field>
        <Field label="Default purse"><Input type="number" step="0.5" value={f.default_purse ?? 100} onChange={(e) => setF({ ...f, default_purse: Number(e.target.value) })} /></Field>
        <Field label="Description" className="md:col-span-3"><Textarea value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Visibility"><Select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as EventRow["visibility"] })}><option value="public">Public (discoverable)</option><option value="unlisted">Unlisted (code only)</option></Select></Field>
        <Field label="Team selection"><Select value={f.team_selection} onChange={(e) => setF({ ...f, team_selection: e.target.value as EventRow["team_selection"] })}><option value="self_select">Participants pick</option><option value="admin_assign">Organiser assigns</option></Select></Field>
        {ev.id && <Field label="Invite code"><Input className="font-mono uppercase" value={f.invite_code ?? ""} onChange={(e) => setF({ ...f, invite_code: e.target.value })} /></Field>}
        <div className="md:col-span-3 flex flex-wrap gap-4">
          <Switch checked={Boolean(f.is_active)} onChange={(v) => setF({ ...f, is_active: v })} label="Active" />
          <Switch checked={Boolean(f.requires_approval)} onChange={(v) => setF({ ...f, requires_approval: v })} label="Join requires approval" />
          <Switch checked={Boolean(f.auctioneer_can_edit_rules)} onChange={(v) => setF({ ...f, auctioneer_can_edit_rules: v })} label="Auctioneer may edit rules" />
        </div>
        <div className="md:col-span-3 flex flex-wrap gap-4 text-sm">
          <span className="text-xs text-faint">Participant permissions:</span>
          {(["view_competitors", "view_official_purses", "view_leaderboard"] as const).map((k) => <Switch key={k} checked={perms[k] !== false} onChange={(v) => setF({ ...f, participant_permissions: { ...perms, [k]: v } })} label={k.replace(/_/g, " ")} />)}
        </div>
        <Field label="Assigned auctioneers" className="md:col-span-3">
          <div className="flex flex-wrap gap-1.5">
            {auctioneers.map((a) => (
              <button key={a.id} type="button" onClick={() => setAuc(auc.includes(a.id) ? auc.filter((x) => x !== a.id) : [...auc, a.id])} className={`rounded-md border px-2 py-1 text-xs cursor-pointer ${auc.includes(a.id) ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted"}`}>
                {a.full_name || a.email}
              </button>
            ))}
            {!auctioneers.length && <span className="text-xs text-muted">No approved auctioneers yet — approve one in Users.</span>}
          </div>
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-faint">Rules, purse limits and rating weights are configured under Manage → Auction rules after creating the event.</p>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>{ev.id ? "Save" : "Create event"}</Button></div>
    </Dialog>
  );
}
