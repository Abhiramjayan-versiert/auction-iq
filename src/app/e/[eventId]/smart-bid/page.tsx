"use client";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_LABEL, fmtRating, hypotheticalPlayer, smartBid, type Category, type Origin } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Badge, PageHeader, Tabs } from "@/components/ui/misc";
import { PlayerPicker, SmartBidPanel, useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function SmartBidPage() {
  const { me, prompt } = useMyTeam();
  const { session, playerById, myTeamId, rules } = useEventData();
  const { intel, strategy, shortlist } = useWorkspace();
  const m = useMoney();
  const [mode, setMode] = useState<"block" | "entered">("block");
  const [pid, setPid] = useState("");
  const [h, setH] = useState({ name: "", rating: "", category: "" as Category | "", origin: "" as Origin | "", base: "" });
  useEffect(() => {
    if (!pid && session?.current_player_id) {
      setPid(session.current_player_id);
      setMode("entered");
    }
  }, [session?.current_player_id, pid]);
  const hyp = useMemo(
    () =>
      h.rating !== "" || h.name
        ? hypotheticalPlayer({ name: h.name, rating: h.rating === "" ? null : Number(h.rating), category: h.category || null, origin: h.origin || null, base: h.base ? Number(h.base) : 0 })
        : null,
    [h],
  );
  const targets = useMemo(() => {
    if (!myTeamId || !intel.byId[myTeamId]) return [];
    return shortlist
      .filter((s) => s.list !== "avoid" && s.player_id)
      .map((s) => playerById[s.player_id as string])
      .filter((p) => p && p.auction_status !== "sold")
      .map((p) => smartBid(intel, myTeamId, p, strategy));
  }, [shortlist, playerById, intel, myTeamId, strategy]);
  if (!me) return prompt;
  return (
    <div className="space-y-4">
      <PageHeader title="Smart Bid" description="A bid ceiling that always keeps enough money to complete your squad. Players are often entered only after they're sold, so you can type in the player on the block." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Bid calculator" action={<Tabs value={mode} onChange={setMode} tabs={[{ value: "block", label: "Player on the block" }, { value: "entered", label: "Entered player" }]} />} />
          <CardBody>
            {mode === "block" ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <Input className="col-span-2" placeholder="Name (optional)" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
                <Input type="number" step="0.01" min={0} max={rules.rating_scale_max} placeholder={`Rating /${rules.rating_scale_max}`} value={h.rating} onChange={(e) => setH({ ...h, rating: e.target.value })} autoFocus />
                <Select value={h.category} onChange={(e) => setH({ ...h, category: e.target.value as Category | "" })}>
                  <option value="">Role (optional)</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </Select>
                <Select value={h.origin} onChange={(e) => setH({ ...h, origin: e.target.value as Origin | "" })}>
                  <option value="">IN/OS (optional)</option>
                  <option value="indian">Indian</option>
                  <option value="overseas">Overseas</option>
                </Select>
                <Input className="col-span-2 md:col-span-1" type="number" step="any" placeholder="Base price (optional)" value={h.base} onChange={(e) => setH({ ...h, base: e.target.value })} />
              </div>
            ) : (
              <PlayerPicker value={pid} onChange={setPid} />
            )}
            <div className="mt-4"><SmartBidPanel player={mode === "block" ? hyp : pid ? playerById[pid] : null} /></div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="My shortlist ceilings" description={`Strategy: ${strategy}`} />
          <CardBody>
            {targets.length === 0 && <p className="text-xs text-muted">Shortlisted players appear here once they&apos;re entered and still unsold.</p>}
            <ul className="space-y-1.5">
              {targets.sort((a, b) => b.maxBid - a.maxBid).map((r) => (
                <li key={r.player.id}>
                  <button className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 cursor-pointer" onClick={() => { setPid(r.player.id); setMode("entered"); }}>
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
