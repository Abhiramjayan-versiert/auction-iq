"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, Flame, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtRating, smartBid, type Player } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button, buttonVariants } from "@/components/ui/button";
import { AuctionStatusBadge, CategoryBadge } from "@/components/domain/badges";
import { PlayerDialog, useMoney } from "@/components/participant/shared";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { ShortlistRow } from "@/lib/types/db";
import { cn } from "@/lib/utils";

const LISTS = [
  { key: "target", title: "Target players", tone: "accent" },
  { key: "backup", title: "Backup players", tone: "info" },
  { key: "avoid", title: "Avoid list", tone: "danger" },
] as const;

export default function Shortlist() {
  const { playerById, event, myTeamId, teamName, players } = useEventData();
  const { shortlist, updateShortlist, removeShortlistRow, watchByName, intel, strategy } = useWorkspace();
  const m = useMoney();
  const [sel, setSel] = useState<Player | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const existing = players.find((p) => p.name.toLowerCase() === n.toLowerCase());
    if (shortlist.some((s) => (s.player_id && s.player_id === existing?.id) || s.player_name?.toLowerCase() === n.toLowerCase())) return toast.info("Already on your shortlist");
    if (existing) await updateOrCreateById(existing.id);
    else await watchByName(n, { target_price: target ? Number(target) : null });
    setName("");
    setTarget("");
    toast.success(existing ? "Added to targets" : `Watching for “${n}” — you'll be alerted when it's entered`);
  };
  const { upsertShortlist } = useWorkspace();
  const updateOrCreateById = (pid: string) => upsertShortlist(pid, "target", { target_price: target ? Number(target) : null });
  const move = async (row: ShortlistRow, list: ShortlistRow[], dir: -1 | 1) => {
    const sorted = [...list].sort((a, b) => a.priority - b.priority);
    const i = sorted.findIndex((x) => x.id === row.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    for (let k = 0; k < sorted.length; k++) if (sorted[k].priority !== k + 1) await updateShortlist(sorted[k].id, { priority: k + 1 });
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Private shortlist" description="Only you can see this. Watch players by name before they're entered — you'll get an alert when they appear or are sold." actions={<Link href={`/e/${event!.id}/players`} className={buttonVariants({ variant: "outline", size: "sm" })}>Player explorer</Link>} />
      <Card className="p-3">
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <Input className="min-w-56 flex-1" placeholder="Player name (entered or not yet entered)" value={name} onChange={(e) => setName(e.target.value)} list="aiq-sl-players" />
          <datalist id="aiq-sl-players">{players.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          <Input className="w-36" type="number" step="any" placeholder="Target price" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Button>Add target</Button>
        </form>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {LISTS.map((l) => {
          const rows = shortlist.filter((s) => s.list === l.key).sort((a, b) => Number(b.high_priority) - Number(a.high_priority) || a.priority - b.priority);
          return (
            <Card key={l.key}>
              <CardHeader title={<span className="flex items-center gap-2">{l.title}<Badge tone={l.tone}>{rows.length}</Badge></span>} />
              <CardBody className="space-y-2">
                {rows.map((s, i) => {
                  const p = s.player_id ? playerById[s.player_id] : null;
                  const sb = p && myTeamId && intel.byId[myTeamId] && p.auction_status !== "sold" && l.key !== "avoid" ? smartBid(intel, myTeamId, p, strategy) : null;
                  return (
                    <div key={s.id} className={cn("rounded-md border border-line/60 bg-surface-2/50 p-2", s.high_priority && "border-accent/50")}>
                      <div className="flex items-center gap-2">
                        <span className="w-4 text-xs text-faint tabular">{i + 1}</span>
                        {p ? (
                          <button onClick={() => setSel(p)} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent cursor-pointer">{p.name}</button>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.player_name} <Badge>not entered yet</Badge></span>
                        )}
                        <button onClick={() => updateShortlist(s.id, { high_priority: !s.high_priority })} title="High priority" className={cn("cursor-pointer", s.high_priority ? "text-accent" : "text-faint hover:text-fg")}><Flame size={14} /></button>
                        <button onClick={() => move(s, rows, -1)} className="text-faint hover:text-fg cursor-pointer" aria-label="Move up"><ArrowUp size={13} /></button>
                        <button onClick={() => move(s, rows, 1)} className="text-faint hover:text-fg cursor-pointer" aria-label="Move down"><ArrowDown size={13} /></button>
                        <button onClick={() => removeShortlistRow(s.id)} className="text-faint hover:text-danger cursor-pointer" aria-label="Remove"><Trash2 size={13} /></button>
                      </div>
                      {p && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-6 text-xs">
                          <CategoryBadge category={p.category} origin={p.origin} />
                          <AuctionStatusBadge status={p.auction_status} />
                          <span className="text-muted">official {fmtRating(p.overall)}</span>
                          {p.auction_status === "sold" ? <span className="text-muted">{teamName(p.sold_team_id)} · {m(p.sold_price)}</span> : null}
                          {sb && (sb.eligible ? <Badge tone="accent">bid ≤ {m(sb.maxBid)}</Badge> : <Badge tone="danger">no bid</Badge>)}
                        </div>
                      )}
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5 pl-6">
                        <Input className="h-7 text-xs" type="number" step="any" placeholder="Target price" defaultValue={s.target_price ?? ""} onBlur={(e) => (e.target.value === "" ? null : Number(e.target.value)) !== (s.target_price ?? null) && updateShortlist(s.id, { target_price: e.target.value === "" ? null : Number(e.target.value) })} />
                        <Input className="h-7 text-xs" type="number" step="any" placeholder="My rating" defaultValue={s.private_rating ?? ""} onBlur={(e) => (e.target.value === "" ? null : Number(e.target.value)) !== (s.private_rating ?? null) && updateShortlist(s.id, { private_rating: e.target.value === "" ? null : Number(e.target.value) })} />
                        <select className="h-7 rounded-md border border-line bg-surface-2 px-1 text-xs" value={s.list} onChange={(e) => updateShortlist(s.id, { list: e.target.value as ShortlistRow["list"] })}>
                          <option value="target">Target</option><option value="backup">Backup</option><option value="avoid">Avoid</option>
                        </select>
                        <Input className="col-span-3 h-7 text-xs" placeholder="Private note…" defaultValue={s.note ?? ""} onBlur={(e) => e.target.value !== (s.note ?? "") && updateShortlist(s.id, { note: e.target.value })} />
                      </div>
                    </div>
                  );
                })}
                {!rows.length && <p className="py-3 text-center text-xs text-muted">Empty</p>}
              </CardBody>
            </Card>
          );
        })}
      </div>
      <PlayerDialog player={sel} onClose={() => setSel(null)} />
    </div>
  );
}
