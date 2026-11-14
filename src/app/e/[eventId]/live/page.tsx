"use client";
import { useMemo, useState } from "react";
import { cellLabel, fmtRating, generateInsights, simulate, CATEGORY_LABEL, type EventAnalysis } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, Progress, Tabs } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { RuleAlerts } from "@/components/domain/alerts";
import { CategoryBadge } from "@/components/domain/badges";
import { InsightCard } from "@/components/domain/insight";
import { PlayerAvatar, TeamChip } from "@/components/domain/team";
import { CompositionGrid, SmartBidPanel, useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn, fmtTime } from "@/lib/utils";

type Mode = "official" | "A" | "B" | "C";

export default function LiveWorkspace() {
  const { me: officialMe, prompt } = useMyTeam();
  const { session, playerById, transactions, teamName, myTeamId, snapshot, rules } = useEventData();
  const { intel, sims, shortlist, notes, saveNote } = useWorkspace();
  const m = useMoney();
  const [mode, setMode] = useState<Mode>("official");
  const [note, setNote] = useState("");
  const a: EventAnalysis = useMemo(
    () => (mode === "official" ? intel : simulate(snapshot, sims.filter((s) => s.scenario === mode).map((s) => ({ ...s, price: Number(s.price) })))),
    [mode, intel, snapshot, sims],
  );
  const me = myTeamId ? a.byId[myTeamId] : null;
  const insights = useMemo(() => (me ? generateInsights(a, me.team.id).slice(0, 4) : []), [a, me]);
  if (!officialMe || !me) return prompt;
  const p = session?.current_player_id ? playerById[session.current_player_id] : null;
  const recent = transactions.filter((t) => t.status === "active").slice(0, 10);
  const comps = [...a.teams].filter((t) => t.team.id !== me.team.id).sort((x, y) => y.maxSingleBid - x.maxSingleBid);
  const maxPurse = Math.max(...a.teams.map((t) => t.initialPurse), 1);
  const rank = a.leaderboard.find((r) => r.teamId === me.team.id)?.officialRank;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={mode} onChange={setMode} tabs={[{ value: "official", label: "Official live data" }, { value: "A", label: "Scenario A" }, { value: "B", label: "Scenario B" }, { value: "C", label: "Scenario C" }]} />
        {mode !== "official" && <Badge tone="warn">Private what-if view — not official</Badge>}
        {session?.announcement && <Badge tone="info">📣 {session.announcement}</Badge>}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_minmax(380px,1.5fr)_minmax(280px,1fr)]">
        {/* LEFT */}
        <Card className="xl:row-span-1">
          <CardHeader title="Current player" description={session ? `Session ${session.status.replace("_", " ")}${session.bidding_open ? " · bidding open" : ""}` : undefined} />
          <CardBody>
            {p ? (
              <div>
                <div className="flex items-center gap-3">
                  <PlayerAvatar name={p.name} url={p.photo_url} size={56} />
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">{[p.nationality, p.batting_style, p.bowling_style].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1"><CategoryBadge category={p.category} origin={p.origin} /></div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-surface-2 p-2"><div className="text-[10px] uppercase text-faint">Rating</div><div className="tabular text-xl font-semibold text-accent">{fmtRating(p.overall)}</div></div>
                  <div className="rounded-md bg-surface-2 p-2"><div className="text-[10px] uppercase text-faint">Base</div><div className="tabular text-xl font-semibold">{m(p.base_price)}</div></div>
                  <div className="rounded-md bg-surface-2 p-2"><div className="text-[10px] uppercase text-faint">Bid</div><div className="tabular text-xl font-semibold">{session?.current_bid && session.bidding_open ? m(session.current_bid) : "—"}</div></div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
                  {([["Bat", p.batting], ["Bowl", p.bowling], ["Field", p.fielding], ["Keep", p.wicketkeeping]] as const).map(([k, v]) => <div key={k} className="rounded bg-surface-2 py-1"><span className="text-faint">{k}</span> <b className="tabular">{fmtRating(v)}</b></div>)}
                </div>
                {p.secondary_category && <div className="mt-2 text-xs text-muted">Secondary: {CATEGORY_LABEL[p.secondary_category]}</div>}
                {session?.current_bid_team_id && session.bidding_open && <div className="mt-2 text-xs text-muted">Leading (announced): {teamName(session.current_bid_team_id)}</div>}
                {shortlist.find((s) => s.player_id === p.id) && <Badge tone="accent" className="mt-2">On your {shortlist.find((s) => s.player_id === p.id)!.list} list</Badge>}
              </div>
            ) : <p className="py-8 text-center text-sm text-muted">Waiting for the auctioneer to bring up the next player…</p>}
          </CardBody>
        </Card>

        {/* CENTER */}
        <Card>
          <div className="grid grid-cols-3 gap-2 p-3">
            <div><div className="text-[10px] uppercase text-faint">Purse</div><div className="tabular text-lg font-semibold text-accent">{m(me.remaining)}</div><div className="text-[11px] text-muted">free {m(me.discretionary)}</div></div>
            <div><div className="text-[10px] uppercase text-faint">Avg rating</div><div className="tabular text-lg font-semibold">{fmtRating(me.rating.average)}</div><div className="text-[11px] text-muted">rank #{rank}</div></div>
            <div><div className="text-[10px] uppercase text-faint">Required</div><div className="tabular text-lg font-semibold">{me.rules.slotsRequired}</div><div className="truncate text-[11px] text-muted">{[...new Set(me.rules.mandatoryPlan)].map(cellLabel).join(", ") || "complete"}</div></div>
          </div>
          <div className="border-t border-line/60 p-3"><CompositionGrid team={me} /></div>
          <div className="border-t border-line/60 p-3">
            <div className="mb-2 text-xs font-semibold">Smart Bid {p ? `· ${p.name}` : ""}</div>
            <SmartBidPanel player={p} compact analysis={a} />
          </div>
        </Card>

        {/* RIGHT */}
        <Card>
          <CardHeader title="Competitors" description="Sorted by bidding capacity" />
          <CardBody className="max-h-[420px] space-y-2 overflow-y-auto">
            {comps.map((t) => (
              <div key={t.team.id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <TeamChip team={t.team} />
                  <span className="tabular"><b>{m(t.remaining)}</b> · {fmtRating(t.rating.average)} · needs {t.rules.slotsRequired}</span>
                </div>
                <Progress className="mt-1" value={t.remaining / maxPurse} tone={!t.purseSufficient ? "danger" : t.discretionary < t.floorReserve * 0.25 ? "warn" : "accent"} />
                <div className="mt-0.5 flex justify-between text-[10px] text-faint"><span>max bid {m(t.maxSingleBid)}</span><span>{[...new Set(t.rules.mandatoryPlan)].slice(0, 2).map(cellLabel).join(", ")}</span></div>
              </div>
            ))}
          </CardBody>
          <div className="border-t border-line/60 p-3">
            <div className="mb-2 text-xs font-semibold">Strategic alerts</div>
            <div className="space-y-2">
              <RuleAlerts alerts={me.rules.alerts} compact hideInfo />
              {insights.map((i) => <InsightCard key={i.id} insight={i} />)}
            </div>
          </div>
        </Card>
      </div>

      {/* BOTTOM */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recent results" />
          <CardBody>
            <ul className="space-y-1 text-xs">
              {recent.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted">{fmtTime(t.created_at)} · <span className="text-fg">{playerById[t.player_id]?.name}</span></span>
                  <span className={cn("tabular", t.type === "unsold" && "text-warn")}>{t.type === "sale" ? `${m(t.amount)} → ${teamName(t.team_id)}` : "Unsold"}</span>
                </li>
              ))}
              {!recent.length && <li className="text-muted">No results yet.</li>}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="My shortlist" />
          <CardBody>
            <ul className="space-y-1 text-xs">
              {shortlist.filter((s) => s.list !== "avoid").sort((x, y) => x.priority - y.priority).slice(0, 10).map((s) => {
                const pl = playerById[s.player_id];
                if (!pl) return null;
                return (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span className={cn("truncate", pl.auction_status === "sold" && "line-through text-faint")}>{pl.name} <Badge>{s.list}</Badge></span>
                    <span className="tabular text-muted">{fmtRating(pl.overall)} · {pl.auction_status === "sold" ? teamName(pl.sold_team_id) : m(pl.base_price)}</span>
                  </li>
                );
              })}
              {!shortlist.length && <li className="text-muted">Shortlist players from the Player Explorer.</li>}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Quick notes" description="Private" />
          <CardBody>
            <div className="flex gap-2">
              <Textarea className="min-h-9" value={note} onChange={(e) => setNote(e.target.value)} placeholder={p ? `Note about ${p.name}…` : "Note…"} />
              <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={async () => { await saveNote({ body: note.trim(), player_id: p?.id ?? null }); setNote(""); }}>Save</Button>
            </div>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
              {notes.slice(0, 8).map((n) => <li key={n.id} className="rounded bg-surface-2 p-1.5">{n.player_id && <b>{playerById[n.player_id]?.name}: </b>}{n.body}</li>)}
            </ul>
          </CardBody>
        </Card>
      </div>
      <p className="text-[11px] text-faint">Results are recorded by the auctioneer; AUCTION IQ does not detect physical bids. Currency: {rules.currency}.</p>
    </div>
  );
}
