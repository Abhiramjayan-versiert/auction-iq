"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtRating, smartBid } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { PlayerPicker, SmartBidPanel, useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function SmartBidPage() {
  const { me, prompt } = useMyTeam();
  const { session, playerById, myTeamId } = useEventData();
  const { intel, strategy, shortlist } = useWorkspace();
  const m = useMoney();
  const [pid, setPid] = useState("");
  useEffect(() => {
    if (!pid && session?.current_player_id) setPid(session.current_player_id);
  }, [session?.current_player_id, pid]);
  const targets = useMemo(() => {
    if (!myTeamId || !intel.byId[myTeamId]) return [];
    return shortlist
      .filter((s) => s.list !== "avoid")
      .map((s) => playerById[s.player_id])
      .filter((p) => p && p.auction_status !== "sold")
      .map((p) => smartBid(intel, myTeamId, p, strategy));
  }, [shortlist, playerById, intel, myTeamId, strategy]);
  if (!me) return prompt;
  return (
    <div className="space-y-4">
      <PageHeader title="Smart Bid" description="Bid ceilings that always protect money for your remaining mandatory players." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Bid calculator" description={session?.current_player_id === pid && pid ? "Showing the player currently on the block" : undefined} />
          <CardBody>
            <PlayerPicker value={pid} onChange={setPid} />
            <div className="mt-4"><SmartBidPanel player={pid ? playerById[pid] : null} /></div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="My shortlist ceilings" description={`Strategy: ${strategy}`} />
          <CardBody>
            {targets.length === 0 && <p className="text-xs text-muted">Add target or backup players from the Player Explorer to see their ceilings here.</p>}
            <ul className="space-y-1.5">
              {targets.sort((a, b) => b.maxBid - a.maxBid).map((r) => (
                <li key={r.player.id}>
                  <button className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 cursor-pointer" onClick={() => setPid(r.player.id)}>
                    <span className="truncate">{r.player.name} <span className="text-xs text-faint">{fmtRating(r.player.overall)}</span></span>
                    {r.eligible ? <b className="tabular text-accent">{m(r.maxBid)}</b> : <Badge tone="danger">no bid</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
