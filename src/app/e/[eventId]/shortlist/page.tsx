"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { fmtRating, smartBid, type Player } from "@/lib/engine";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, Empty, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { AuctionStatusBadge, CategoryBadge } from "@/components/domain/badges";
import { PlayerDialog, useMoney } from "@/components/participant/shared";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { ShortlistRow } from "@/lib/types/db";

const LISTS = [
  { key: "target", title: "Target players", tone: "accent" },
  { key: "backup", title: "Backup players", tone: "info" },
  { key: "avoid", title: "Avoid list", tone: "danger" },
] as const;

export default function Shortlist() {
  const { playerById, event, myTeamId, teamName } = useEventData();
  const { shortlist, upsertShortlist, removeShortlist, intel, strategy } = useWorkspace();
  const m = useMoney();
  const [sel, setSel] = useState<Player | null>(null);
  const move = async (row: ShortlistRow, list: ShortlistRow[], dir: -1 | 1) => {
    const sorted = [...list].sort((a, b) => a.priority - b.priority);
    const i = sorted.findIndex((x) => x.id === row.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    for (let k = 0; k < sorted.length; k++) if (sorted[k].priority !== k + 1) await upsertShortlist(sorted[k].player_id, sorted[k].list, { priority: k + 1 });
  };
  if (!shortlist.length)
    return (
      <div>
        <PageHeader title="Private shortlist" />
        <Empty title="Your shortlist is empty">Open any player in the <Link href={`/e/${event!.id}/players`} className="text-accent">Player Explorer</Link> and mark them as target, backup or avoid.</Empty>
      </div>
    );
  return (
    <div className="space-y-4">
      <PageHeader title="Private shortlist" description="Visible only to you. Priority ranking drives your live workspace." actions={<Link href={`/e/${event!.id}/players`} className={buttonVariants({ variant: "outline", size: "sm" })}>Add players</Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        {LISTS.map((l) => {
          const rows = shortlist.filter((s) => s.list === l.key).sort((a, b) => a.priority - b.priority);
          return (
            <Card key={l.key}>
              <CardHeader title={<span className="flex items-center gap-2">{l.title}<Badge tone={l.tone}>{rows.length}</Badge></span>} />
              <ul className="divide-y divide-line/40 px-2 pb-2">
                {rows.map((s, i) => {
                  const p = playerById[s.player_id];
                  if (!p) return null;
                  const sb = myTeamId && intel.byId[myTeamId] && p.auction_status !== "sold" && l.key !== "avoid" ? smartBid(intel, myTeamId, p, strategy) : null;
                  return (
                    <li key={s.id} className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-xs text-faint tabular">{i + 1}</span>
                        <button onClick={() => setSel(p)} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent cursor-pointer">{p.name}</button>
                        <span className="tabular text-sm">{fmtRating(p.overall)}</span>
                        <button onClick={() => move(s, rows, -1)} className="text-faint hover:text-fg cursor-pointer" aria-label="Move up"><ArrowUp size={13} /></button>
                        <button onClick={() => move(s, rows, 1)} className="text-faint hover:text-fg cursor-pointer" aria-label="Move down"><ArrowDown size={13} /></button>
                        <button onClick={() => removeShortlist(p.id)} className="text-faint hover:text-danger cursor-pointer" aria-label="Remove"><Trash2 size={13} /></button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-7 text-xs">
                        <CategoryBadge category={p.category} origin={p.origin} />
                        <AuctionStatusBadge status={p.auction_status} />
                        {p.auction_status === "sold" ? <span className="text-muted">{teamName(p.sold_team_id)} · {m(p.sold_price)}</span> : <span className="text-muted">base {m(p.base_price)}</span>}
                        {sb && (sb.eligible ? <Badge tone="accent">max {m(sb.maxBid)}</Badge> : <Badge tone="danger">no bid</Badge>)}
                      </div>
                      <Input className="mt-1.5 ml-7 h-7 w-[calc(100%-1.75rem)] text-xs" placeholder="Private note…" defaultValue={s.note ?? ""} onBlur={(e) => e.target.value !== (s.note ?? "") && upsertShortlist(p.id, s.list, { note: e.target.value, priority: s.priority })} />
                    </li>
                  );
                })}
                {!rows.length && <li className="px-2 py-4 text-center text-xs text-muted">Empty</li>}
              </ul>
            </Card>
          );
        })}
      </div>
      <PlayerDialog player={sel} onClose={() => setSel(null)} />
    </div>
  );
}
