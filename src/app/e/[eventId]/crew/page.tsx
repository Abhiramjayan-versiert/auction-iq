"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Empty, PageHeader } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { InstallButton } from "@/components/shell/InstallButton";
import { useEventData } from "@/hooks/useEventData";
import { rpc } from "@/lib/data/rpc";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/utils";

interface CrewRow { user_id: string; full_name: string; email: string; college: string | null; role: "data_entry" | "analyst"; status: string; is_owner: boolean; joined_at: string }

function Crew() {
  const router = useRouter();
  const isNew = useSearchParams().get("new") === "1";
  const { event, isTracker, isOwner, userId, players, teams, reload, canManage } = useEventData();
  const [crew, setCrew] = useState<CrewRow[]>([]);
  const [name, setName] = useState(event?.name ?? "");
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().rpc("get_crew", { p_event: event!.id });
    setCrew(((data ?? []) as CrewRow[]).filter((c) => c.status === "approved"));
  }, [event]);
  useEffect(() => void load(), [load]);
  if (!isTracker) return <Empty title="Crews are available for trackers">Official auctions are managed by the event organiser.</Empty>;
  const link = typeof window !== "undefined" ? `${window.location.origin}/join?code=${event!.invite_code}` : "";
  const copy = (t: string, msg: string) => { void navigator.clipboard.writeText(t); toast.success(msg); };
  const share = async () => {
    const text = `Join my AUCTION IQ crew for "${event!.name}". Crew code: ${event!.invite_code}`;
    if (navigator.share) await navigator.share({ title: "AUCTION IQ crew", text, url: link }).catch(() => null);
    else copy(`${text}\n${link}`, "Invite copied");
  };
  const setRole = async (u: string, role: string) => { if (await rpc("set_crew_role", { p_event: event!.id, p_user: u, p_role: role }, "Role updated")) { await load(); await reload(); } };
  const remove = async (c: CrewRow) => {
    if (!confirm(c.user_id === userId ? "Leave this crew?" : `Remove ${c.full_name || c.email} from the crew?`)) return;
    if (await rpc("remove_crew_member", { p_event: event!.id, p_user: c.user_id }, c.user_id === userId ? "You left the crew" : "Removed")) {
      if (c.user_id === userId) router.push("/dashboard"); else await load();
    }
  };
  const dataEntry = crew.filter((c) => c.role === "data_entry");
  return (
    <div className="space-y-4">
      <PageHeader title="Crew & roles" description="Your team-mates. Data entry records what happens in the auction room; analysts get the same live insights on their own phone or laptop." actions={<InstallButton />} />
      {isNew && (
        <Card className="border-accent/40 p-4">
          <div className="font-semibold">Tracker ready — three steps to go live</div>
          <ol className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <li className="rounded-md bg-surface-2 p-3"><b>1. Add players</b><p className="text-xs text-muted">{players.length} so far. Type them in or import your Excel sheet.</p><Link href={`/manage/${event!.id}/players`} className={buttonVariants({ size: "sm", className: "mt-2" })}>Add players</Link></li>
            <li className="rounded-md bg-surface-2 p-3"><b>2. Invite your crew</b><p className="text-xs text-muted">Share the crew code below. They join as analysts.</p><Button size="sm" className="mt-2" variant="secondary" onClick={share}>Share invite</Button></li>
            <li className="rounded-md bg-surface-2 p-3"><b>3. Record results</b><p className="text-xs text-muted">During the auction, log each sale in seconds.</p><Link href={`/manage/${event!.id}/entry`} className={buttonVariants({ size: "sm", variant: "secondary", className: "mt-2" })}>Open data entry</Link></li>
          </ol>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Crew (${crew.length})`} description={dataEntry.length ? `Data entry: ${dataEntry.map((d) => d.full_name || d.email).join(", ")}` : "No one is on data entry — the owner should assign someone."} />
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-faint"><th className="py-1">Member</th><th>Role</th><th>Joined</th><th /></tr></thead>
              <tbody>{crew.map((c) => (
                <tr key={c.user_id} className="border-t border-line/40">
                  <td className="py-2"><div className="font-medium">{c.full_name || "—"} {c.is_owner && <Badge tone="accent">owner</Badge>} {c.user_id === userId && <Badge>you</Badge>}</div><div className="text-xs text-faint">{c.email}</div></td>
                  <td>
                    {isOwner ? (
                      <Select className="h-8 w-36 text-xs" value={c.role} onChange={(e) => setRole(c.user_id, e.target.value)}>
                        <option value="data_entry">Data entry</option><option value="analyst">Analyst (view)</option>
                      </Select>
                    ) : <Badge tone={c.role === "data_entry" ? "accent" : "info"}>{c.role === "data_entry" ? "Data entry" : "Analyst"}</Badge>}
                  </td>
                  <td className="text-xs text-faint">{fmtDate(c.joined_at)}</td>
                  <td className="text-right">{!c.is_owner && (isOwner || c.user_id === userId) && <button onClick={() => remove(c)} className="text-faint hover:text-danger cursor-pointer" aria-label="Remove"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="mt-3 text-xs text-muted">Only <b>Data entry</b> members can add players, teams, rules and results. <b>Analysts</b> are read-only and every change appears on their screens instantly.</p>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Invite team-mates" />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-lg tracking-widest">{event!.invite_code}</span>
                <button onClick={() => copy(event!.invite_code, "Code copied")} className="text-muted hover:text-fg cursor-pointer" aria-label="Copy code"><Copy size={15} /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={share}>Share invite</Button>
                <Button size="sm" variant="outline" onClick={() => copy(link, "Link copied")}>Copy link</Button>
              </div>
              <p className="text-xs text-muted">Team-mates sign up, open <b>Join auction / crew</b> and enter this code. Keep it private — anyone with it joins as an analyst.</p>
              {isOwner && <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Generate a new code? The old one stops working.") && (await rpc("reset_crew_code", { p_event: event!.id }, "New crew code generated"))) await reload(); }}><RefreshCw size={13} /> Reset code</Button>}
            </CardBody>
          </Card>
          {isOwner && (
            <Card>
              <CardHeader title="Tracker settings" />
              <CardBody className="space-y-2">
                <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Button size="sm" variant="secondary" onClick={async () => { if (await rpc("update_tracker", { p_event: event!.id, p_name: name, p_currency: null }, "Saved")) await reload(); }}>Save</Button>
                <div className="pt-2 text-xs text-muted">{teams.length} teams · {players.length} players · {canManage ? "you are on data entry" : "you are an analyst"}</div>
                <Button size="sm" variant="danger" onClick={async () => { if (prompt(`Type DELETE to permanently delete "${event!.name}" and all its data`) === "DELETE" && (await rpc("delete_tracker", { p_event: event!.id }, "Tracker deleted"))) router.push("/dashboard"); }}>Delete tracker</Button>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><Crew /></Suspense>;
}
