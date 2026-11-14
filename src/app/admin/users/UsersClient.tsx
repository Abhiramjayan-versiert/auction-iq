"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Dialog, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ActivityRow, ProfileRow } from "@/lib/types/db";
import { fmtDate } from "@/lib/utils";
import { createUserAction, deleteUserAction, sendRecoveryAction } from "./actions";

export function UsersClient({ initial, selfId }: { initial: ProfileRow[]; selfId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState(sp.get("filter") === "pending" ? "pending" : "");
  const [from, setFrom] = useState("");
  const [sel, setSel] = useState<ProfileRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();
  const list = initial.filter((u) => {
    const s = q.toLowerCase();
    if (s && !`${u.full_name} ${u.email} ${u.phone ?? ""} ${u.college ?? ""}`.toLowerCase().includes(s)) return false;
    if (role && u.platform_role !== role) return false;
    if (status === "pending" && !(u.requested_role === "auctioneer" && u.platform_role === "participant")) return false;
    if (status && status !== "pending" && u.status !== status) return false;
    if (from && u.created_at < from) return false;
    return true;
  });
  const setUser = async (u: ProfileRow, p_role: string, p_status: string) => {
    const { error } = await supabaseBrowser().rpc("admin_set_user", { p_user: u.id, p_role, p_status });
    if (error) return toast.error(error.message);
    toast.success("User updated");
    router.refresh();
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Users" description={`${initial.length} registered users`} actions={<Button onClick={() => setCreating(true)}>Create user</Button>} />
      <Card>
        <div className="grid gap-2 p-3 md:grid-cols-5">
          <Input className="md:col-span-2" placeholder="Search name, email, phone, college…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="participant">Participant</option><option value="auctioneer">Auctioneer</option><option value="super_admin">Super Admin</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="pending">Auctioneer requests</option></Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Registered on/after" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line/70 text-left text-[11px] uppercase text-faint"><th className="px-3 py-2">User</th><th>Phone</th><th>College / city</th><th>Role</th><th>Status</th><th>Registered</th><th /></tr></thead>
            <tbody>{list.map((u) => (
              <tr key={u.id} className="border-b border-line/40 hover:bg-surface-2/50">
                <td className="px-3 py-2"><button className="text-left cursor-pointer" onClick={() => setSel(u)}><div className="font-medium hover:text-accent">{u.full_name || "—"}</div><div className="text-xs text-faint">{u.email}</div></button></td>
                <td className="text-xs">{u.phone ?? "—"}</td>
                <td className="text-xs">{u.college ?? "—"}<div className="text-faint">{[u.city, u.state].filter(Boolean).join(", ")}</div></td>
                <td><Badge tone={u.platform_role === "super_admin" ? "accent" : u.platform_role === "auctioneer" ? "info" : "neutral"}>{u.platform_role.replace("_", " ")}</Badge>{u.requested_role === "auctioneer" && u.platform_role === "participant" && <Badge tone="warn" className="ml-1">requests auctioneer</Badge>}</td>
                <td><Badge tone={u.status === "active" ? "ok" : "danger"}>{u.status}</Badge></td>
                <td className="text-xs text-faint">{fmtDate(u.created_at)}</td>
                <td className="pr-3 text-right">
                  {u.id !== selfId && (
                    <span className="flex justify-end gap-1">
                      {u.requested_role === "auctioneer" && u.platform_role === "participant" && <Button size="sm" onClick={() => setUser(u, "auctioneer", u.status)}>Approve auctioneer</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setUser(u, u.platform_role, u.status === "active" ? "suspended" : "active")}>{u.status === "active" ? "Suspend" : "Reactivate"}</Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      {sel && <UserDialog u={sel} selfId={selfId} onClose={() => setSel(null)} onRole={(r) => setUser(sel, r, sel.status)} pending={pending} start={start} />}
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function UserDialog({ u, selfId, onClose, onRole, pending, start }: { u: ProfileRow; selfId: string; onClose: () => void; onRole: (r: string) => void; pending: boolean; start: (f: () => void) => void }) {
  const router = useRouter();
  const [history, setHistory] = useState<{ role: string; status: string; joined_at: string; events: { id: string; name: string; status: string } }[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [h, a] = await Promise.all([
      sb.from("event_members").select("role, status, joined_at, events(id, name, status)").eq("user_id", u.id),
      sb.from("activity_logs").select("*").eq("actor_id", u.id).order("created_at", { ascending: false }).limit(30),
    ]);
    setHistory((h.data ?? []) as never);
    setActivity((a.data ?? []) as ActivityRow[]);
  }, [u.id]);
  useEffect(() => void load(), [load]);
  return (
    <Dialog open onClose={onClose} title={u.full_name || u.email} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 text-sm">
          {[["Email", u.email], ["Phone", u.phone], ["College", u.college], ["City / state", [u.city, u.state].filter(Boolean).join(", ")], ["Registered", fmtDate(u.created_at)]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span>{v || "—"}</span></div>)}
          <Field label="Platform role" className="pt-2">
            <Select value={u.platform_role} onChange={(e) => onRole(e.target.value)} disabled={u.id === selfId}>
              <option value="participant">Participant</option><option value="auctioneer">Auctioneer (event coordinator)</option><option value="super_admin">Super Admin</option>
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await sendRecoveryAction(u.email); (r.ok ? toast.success : toast.error)(r.message); })}>Send password recovery</Button>
            {u.id !== selfId && <Button size="sm" variant="danger" disabled={pending} onClick={() => confirm(`Permanently delete ${u.email}? This removes their account and private workspace data. Official auction transactions are retained.`) && start(async () => { const r = await deleteUserAction(u.id); (r.ok ? toast.success : toast.error)(r.message); if (r.ok) { onClose(); router.refresh(); } })}>Delete account</Button>}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-faint">Participation history</div>
          <ul className="space-y-1 text-xs">{history.map((h) => <li key={h.events.id} className="flex justify-between"><span>{h.events.name}</span><span><Badge>{h.role}</Badge> <Badge tone={h.status === "approved" ? "ok" : "warn"}>{h.status}</Badge></span></li>)}{!history.length && <li className="text-muted">No events.</li>}</ul>
          <div className="mb-1 mt-3 text-xs font-medium text-faint">Recent activity</div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px]">{activity.map((a) => <li key={a.id} className="flex justify-between gap-2"><Badge>{a.action}</Badge><span className="text-faint">{fmtDate(a.created_at)}</span></li>)}{!activity.length && <li className="text-muted">No recorded activity.</li>}</ul>
        </div>
      </div>
    </Dialog>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ email: "", full_name: "", password: "", college: "", role: "participant" as "participant" | "auctioneer" | "super_admin" });
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title="Create user">
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createUserAction(f); (r.ok ? toast.success : toast.error)(r.message); if (r.ok) { onClose(); router.refresh(); } }); }}>
        <Field label="Full name"><Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" hint="Min 8 characters — ask the user to change it."><Input type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="College"><Input value={f.college} onChange={(e) => setF({ ...f, college: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as typeof f.role })}><option value="participant">Participant</option><option value="auctioneer">Auctioneer</option><option value="super_admin">Super Admin</option></Select></Field>
        <p className="text-[11px] text-faint">Requires SUPABASE_SERVICE_ROLE_KEY on the server.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={pending}>Create</Button></div>
      </form>
    </Dialog>
  );
}
