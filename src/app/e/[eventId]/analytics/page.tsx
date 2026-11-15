"use client";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { CATEGORIES, CATEGORY_LABEL, fmtRating, priceModel } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Empty, PageHeader } from "@/components/ui/misc";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";

const tip = { contentStyle: { background: "#18181b", border: "1px solid #26262b", borderRadius: 8, fontSize: 12 }, cursor: { fill: "#ffffff08" } };
const axis = { tick: { fill: "#71717a", fontSize: 10 }, stroke: "#26262b" };

export default function Analytics() {
  const { transactions, playerById, teamName, myTeamId, rules } = useEventData();
  const { intel } = useWorkspace();
  const name = (id: string) => intel.byId[id].team.short_name || intel.byId[id].team.name;
  const teams = useMemo(() => [...intel.teams].sort((a, b) => (b.rating.average ?? 0) - (a.rating.average ?? 0)), [intel]);
  const ratingData = teams.map((t) => ({ team: name(t.team.id), Average: t.rating.average ?? 0, Weighted: t.rating.weighted ?? 0, me: t.team.id === myTeamId }));
  const purseData = intel.teams.filter((t) => t.purseKnown).map((t) => ({ team: name(t.team.id), Spent: t.spent, Remaining: Math.max(0, t.remaining) }));
  const effData = intel.teams.filter((t) => t.spent > 0 && t.rating.ratedCount).map((t) => ({ team: name(t.team.id), "Rating per unit": Number((t.rating.total / t.spent).toFixed(3)) })).sort((a, b) => b["Rating per unit"] - a["Rating per unit"]);
  const scatter = transactions.filter((t) => t.status === "active" && t.type === "sale" && playerById[t.player_id]?.overall != null).map((t) => ({ rating: playerById[t.player_id].overall as number, price: Number(t.amount), name: playerById[t.player_id].name, team: teamName(t.team_id) }));
  const trend = useMemo(() => {
    let cum = 0;
    return [...transactions].filter((t) => t.status === "active" && t.type === "sale").sort((a, b) => a.seq - b.seq).map((t, i) => {
      cum += Number(t.amount ?? 0);
      return { n: i + 1, Cumulative: Number(cum.toFixed(2)), Price: Number(t.amount) };
    });
  }, [transactions]);
  const catOk = intel.market.categoryCoverage >= 0.4;
  const catData = CATEGORIES.map((c) => ({ category: CATEGORY_LABEL[c], ...Object.fromEntries([["Indian", 0], ["Overseas", 0]]) }));
  intel.teams.forEach((t) => t.players.forEach((p) => {
    if (!p.category) return;
    const row = catData[CATEGORIES.indexOf(p.category)] as Record<string, number | string>;
    const k = p.origin === "overseas" ? "Overseas" : "Indian";
    row[k] = (row[k] as number) + 1;
  }));
  const model = priceModel(intel);
  if (!transactions.length) return <div><PageHeader title="Analytics" /><Empty title="No entries yet">Charts appear as soon as the first results are entered.</Empty></div>;
  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" description={`Official ranking uses “${rules.ranking_formula}”. Analytical scores are shown separately and never replace the official result.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Team rating comparison" description="Official average vs analytical weighted score" />
          <CardBody><ResponsiveContainer width="100%" height={260}><BarChart data={ratingData}><CartesianGrid stroke="#26262b" vertical={false} /><XAxis dataKey="team" {...axis} /><YAxis {...axis} domain={[0, rules.rating_scale_max]} width={28} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Average" fill="#a3e635" radius={[3, 3, 0, 0]} /><Bar dataKey="Weighted" fill="#60a5fa" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></CardBody>
        </Card>
        <Card>
          <CardHeader title="Purse utilisation" description="Teams with a known purse" />
          <CardBody>{purseData.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={purseData}><CartesianGrid stroke="#26262b" vertical={false} /><XAxis dataKey="team" {...axis} /><YAxis {...axis} width={34} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Spent" stackId="p" fill="#60a5fa" /><Bar dataKey="Remaining" stackId="p" fill="#a3e635" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="text-sm text-muted">No team purses have been set.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Price vs rating" description={model.kind === "regression" ? model.description : "Each dot is a sale"} />
          <CardBody>{scatter.length ? <ResponsiveContainer width="100%" height={260}><ScatterChart><CartesianGrid stroke="#26262b" /><XAxis type="number" dataKey="rating" name="Rating" {...axis} domain={["auto", "auto"]} /><YAxis type="number" dataKey="price" name="Price" {...axis} width={34} /><ZAxis range={[40, 40]} /><Tooltip {...tip} formatter={(v) => String(v)} labelFormatter={() => ""} /><Scatter data={scatter} fill="#a3e635" /></ScatterChart></ResponsiveContainer> : <p className="text-sm text-muted">Needs rated sales.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Spending trend" description="Cumulative spend across all teams, sale by sale" />
          <CardBody>{trend.length ? <ResponsiveContainer width="100%" height={260}><LineChart data={trend}><CartesianGrid stroke="#26262b" vertical={false} /><XAxis dataKey="n" {...axis} /><YAxis {...axis} width={40} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line dataKey="Cumulative" stroke="#a3e635" dot={false} strokeWidth={2} /><Line dataKey="Price" stroke="#60a5fa" dot={false} strokeWidth={1.5} /></LineChart></ResponsiveContainer> : <p className="text-sm text-muted">No sales yet.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Value for money" description="Total rating per unit spent" />
          <CardBody>{effData.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={effData} layout="vertical"><CartesianGrid stroke="#26262b" horizontal={false} /><XAxis type="number" {...axis} /><YAxis type="category" dataKey="team" {...axis} width={70} /><Tooltip {...tip} /><Bar dataKey="Rating per unit" fill="#a3e635" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer> : <p className="text-sm text-muted">Needs rated purchases.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Category distribution" description={catOk ? "Players bought, by role" : "Shown when most players have a recorded role"} />
          <CardBody>{catOk ? <ResponsiveContainer width="100%" height={260}><BarChart data={catData}><CartesianGrid stroke="#26262b" vertical={false} /><XAxis dataKey="category" {...axis} /><YAxis {...axis} width={28} allowDecimals={false} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="Indian" stackId="c" fill="#a3e635" /><Bar dataKey="Overseas" stackId="c" fill="#60a5fa" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="text-sm text-muted">Only {Math.round(intel.market.categoryCoverage * 100)}% of players have a recorded role.</p>}</CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Squad validity" />
        <CardBody className="grid gap-1 text-sm md:grid-cols-2">
          {intel.teams.map((t) => <div key={t.team.id} className="flex justify-between"><span>{t.team.name}</span><span className="tabular text-muted">{t.rating.count}/{rules.squad_min} · avg {fmtRating(t.rating.average)} · {t.rules.status}</span></div>)}
        </CardBody>
      </Card>
    </div>
  );
}
