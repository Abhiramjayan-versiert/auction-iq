"use client";
import { useCallback, useEffect, useState } from "react";
import { Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { Badge, PageHeader, Tabs } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useEventData } from "@/hooks/useEventData";
import { rpc } from "@/lib/data/rpc";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { EventMemberRow } from "@/lib/types/db";
import { fmtDate } from "@/lib/utils";

export default function Members() {
  const { event, teams, teamMembers, reload } = useEventData();
  const [rows, setRows] = useState<EventMemberRow[]>([]);
  const [tab, setTab] = useState<"all" | "pending" | "unassigned">("all");
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("event_members").select("*, profiles(full_name, email, college)").eq("event_id", event!.id).order("joined_at");
    setRows((data ?? []) as EventMemberRow[]);
  }, [event]);
  useEffect(() => void load(), [load]);
  const after = async () => { await load(); await reload(); };
  const teamOf = (uid: string) => teamMembers.find((t) => t.user_id === uid)?.team_id ?? "";
  const list = rows.filter((r) => (tab === "pending" ? r.status === "pending" : tab === "unassigned" ? r.role === "participant" && r.status === "approved" && !teamOf(r.user_id) : true))
    .filter((r) => !q || `${r.profiles?.full_name} ${r.profiles?.email} ${r.profiles?.college}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <PageHeader title="Participants" description={`${rows.filter((r) => r.role === "participant").length} participants · ${rows.filter((r) => r.status === "pending").length} pending`} />
      <div className="flex flex-wrap gap-2">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "all", label: "All" }, { value: "pending", label: "Pending approval" }, { value: "unassigned", label: "Without team" }]} />
        <Input className="max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line/70 text-left text-[11px] uppercase text-faint"><th className="px-3 py-2">Name</th><th>College</th><th>Role</th><th>Status</th><th>Team</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.user_id} className="border-b border-line/40">
                <td className="px-3 py-2"><div className="font-medium">{r.profiles?.full_name || "—"}</div><div className="text-xs text-faint">{r.profiles?.email}</div></td>
                <td className="text-xs">{r.profiles?.college ?? "—"}</td>
                <td><Badge tone={r.role === "auctioneer" ? "info" : "neutral"}>{r.role}</Badge></td>
                <td><Badge tone={r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "danger"}>{r.status}</Badge></td>
                <td>
                  {r.role === "participant" && r.status === "approved" && (
                    <Select className="h-8 w-44 text-xs" value={teamOf(r.user_id)} onChange={async (e) => { await rpc("assign_team", { p_event: event!.id, p_user: r.user_id, p_team: e.target.value || null }, "Team assignment saved"); await after(); }}>
                      <option value="">No team</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{teamMembers.some((m) => m.team_id === t.id && m.user_id !== r.user_id) ? " (taken)" : ""}</option>)}
                    </Select>
                  )}
                </td>
                <td className="text-xs text-faint">{fmtDate(r.joined_at)}</td>
                <td className="pr-3 text-right">
                  {r.role === "participant" && (
                    <span className="flex justify-end gap-1">
                      {r.status !== "approved" && <Button size="sm" onClick={async () => { await rpc("set_member_status", { p_event: event!.id, p_user: r.user_id, p_status: "approved" }, "Approved"); await after(); }}>Approve</Button>}
                      {r.status === "pending" && <Button size="sm" variant="ghost" onClick={async () => { await rpc("set_member_status", { p_event: event!.id, p_user: r.user_id, p_status: "rejected" }, "Rejected"); await after(); }}>Reject</Button>}
                      {r.status === "approved" && <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Remove this participant from the event?")) { await rpc("set_member_status", { p_event: event!.id, p_user: r.user_id, p_status: "removed" }, "Removed"); await after(); } }}>Remove</Button>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="py-8 text-center text-xs text-muted">No participants match.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
