"use client";
import { useMemo, useState } from "react";
import { Download, Star } from "lucide-react";
import { CATEGORIES, CATEGORY_LABEL, fmtRating, playerValues, type PlayerValue, type Player } from "@/lib/engine";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Badge, PageHeader, Tabs } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/table";
import { AuctionStatusBadge, CategoryBadge } from "@/components/domain/badges";
import { PlayerDialog, PlayerName, useMoney } from "@/components/participant/shared";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { downloadCsv } from "@/lib/utils";

type View = "all" | "best_value" | "expensive" | "top" | "affordable" | "improve" | "fits";

export default function PlayerExplorer() {
  const { players, myTeamId, teamName, event } = useEventData();
  const { intel, shortlist } = useWorkspace();
  const m = useMoney();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("");
  const [minR, setMinR] = useState("");
  const [budget, setBudget] = useState("");
  const [view, setView] = useState<View>("all");
  const [sel, setSel] = useState<Player | null>(null);
  const me = myTeamId ? intel.byId[myTeamId] : undefined;
  const values = useMemo(() => playerValues(intel, players, myTeamId ?? undefined), [intel, players, myTeamId]);
  const sl = useMemo(() => Object.fromEntries(shortlist.map((s) => [s.player_id, s.list])), [shortlist]);
  const filtered = values.filter((v) => {
    const p = v.player;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !(p.nationality ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (cat && p.category !== cat) return false;
    if (origin && p.origin !== origin) return false;
    if (status && p.auction_status !== status) return false;
    if (minR && (p.overall ?? 0) < Number(minR)) return false;
    if (budget && v.price > Number(budget)) return false;
    const avail = p.auction_status !== "sold" && p.auction_status !== "withdrawn";
    switch (view) {
      case "affordable": return avail && me ? v.price <= me.maxSingleBid : avail;
      case "improve": return avail && (v.improvement ?? 0) > 0;
      case "fits": return avail && v.fitsNeeds;
      case "expensive": return p.auction_status === "sold";
      default: return true;
    }
  });
  const sortFor: Record<View, { key: string; dir: "asc" | "desc" }> = {
    all: { key: "ovr", dir: "desc" }, best_value: { key: "vi", dir: "desc" }, expensive: { key: "price", dir: "desc" }, top: { key: "ovr", dir: "desc" },
    affordable: { key: "vi", dir: "desc" }, improve: { key: "imp", dir: "desc" }, fits: { key: "imp", dir: "desc" },
  };
  const cols: Column<PlayerValue>[] = [
    { key: "name", header: "Player", cell: (v) => <span className="flex items-center gap-1.5"><PlayerName p={v.player} sub />{sl[v.player.id] && <Star size={11} className={sl[v.player.id] === "avoid" ? "text-danger" : "text-accent"} />}</span>, sort: (v) => v.player.name },
    { key: "cat", header: "Role", cell: (v) => <CategoryBadge category={v.player.category} origin={v.player.origin} />, sort: (v) => v.player.category },
    { key: "ovr", header: "Overall", align: "right", cell: (v) => <b>{fmtRating(v.player.overall)}</b>, sort: (v) => v.player.overall },
    { key: "bat", header: "Bat", align: "right", cell: (v) => fmtRating(v.player.batting), sort: (v) => v.player.batting ?? null },
    { key: "bowl", header: "Bowl", align: "right", cell: (v) => fmtRating(v.player.bowling), sort: (v) => v.player.bowling ?? null },
    { key: "base", header: "Base", align: "right", cell: (v) => m(v.player.base_price), sort: (v) => v.player.base_price },
    { key: "price", header: "Price", align: "right", cell: (v) => m(v.price), sort: (v) => v.price },
    { key: "eff", header: "Rating/price", align: "right", cell: (v) => (v.efficiency === null ? "—" : v.efficiency.toFixed(2)), sort: (v) => v.efficiency },
    { key: "vi", header: "Value idx", align: "right", cell: (v) => (v.valueIndex === null ? "—" : <Badge tone={v.valueIndex >= 70 ? "accent" : v.valueIndex >= 40 ? "neutral" : "warn"}>{v.valueIndex.toFixed(0)}</Badge>), sort: (v) => v.valueIndex },
    { key: "imp", header: "My avg Δ", align: "right", cell: (v) => (v.improvement === null || v.player.auction_status === "sold" ? "—" : <span className={v.improvement >= 0 ? "text-ok" : "text-danger"}>{v.improvement >= 0 ? "+" : ""}{v.improvement.toFixed(2)}</span>), sort: (v) => (v.player.auction_status === "sold" ? null : v.improvement) },
    { key: "fit", header: "Fit", cell: (v) => (v.player.auction_status === "sold" ? null : !v.allowed ? <Badge tone="danger">breaks rule</Badge> : v.fitsNeeds ? <Badge tone="accent">needed</Badge> : null) },
    { key: "status", header: "Status", cell: (v) => <span className="flex items-center gap-1"><AuctionStatusBadge status={v.player.auction_status} />{v.player.sold_team_id && <span className="text-xs text-muted">{teamName(v.player.sold_team_id)}</span>}</span>, sort: (v) => v.player.auction_status },
  ];
  const exportCsv = () =>
    downloadCsv(`${event?.name ?? "players"}-players.csv`, filtered.map((v) => ({
      name: v.player.name, nationality: v.player.nationality, origin: v.player.origin, category: v.player.category, base_price: v.player.base_price,
      overall: v.player.overall, batting: v.player.batting, bowling: v.player.bowling, fielding: v.player.fielding, status: v.player.auction_status,
      sold_to: teamName(v.player.sold_team_id), price: v.player.sold_price, value_index: v.valueIndex, my_avg_change: v.improvement, my_shortlist: sl[v.player.id] ?? "",
    })));
  return (
    <div className="space-y-4">
      <PageHeader title="Player explorer & value analyzer" description="Value index = rating ÷ price, normalised 0–100 within each role (winning price for sold players, base price otherwise)." actions={<Button variant="outline" size="sm" onClick={exportCsv}><Download size={14} /> Export CSV</Button>} />
      <Tabs value={view} onChange={setView} tabs={[
        { value: "all", label: "All" }, { value: "best_value", label: "Best value" }, { value: "expensive", label: "Most expensive" }, { value: "top", label: "Highest rated" },
        { value: "affordable", label: "Affordable for me" }, { value: "improve", label: "Improves my average" }, { value: "fits", label: "Fits my requirements" },
      ]} />
      <Card>
        <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-6">
          <Input className="col-span-2" placeholder="Search name or nationality…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All roles</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select>
          <Select value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">Indian & overseas</option><option value="indian">Indian</option><option value="overseas">Overseas</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{["upcoming", "available", "sold", "unsold", "withdrawn"].map((s) => <option key={s}>{s}</option>)}</Select>
          <div className="flex gap-2"><Input type="number" step="0.1" placeholder="Min rating" value={minR} onChange={(e) => setMinR(e.target.value)} /><Input type="number" step="0.25" placeholder="Max price" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
        </div>
        <div className="px-3 pb-1 text-xs text-faint">{filtered.length} players</div>
        <DataTable key={view} rows={filtered} columns={cols} rowKey={(v) => v.player.id} initialSort={sortFor[view]} onRowClick={(v) => setSel(v.player)} dense />
      </Card>
      <PlayerDialog player={sel} onClose={() => setSel(null)} />
    </div>
  );
}
