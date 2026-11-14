"use client";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { TeamRating } from "@/lib/engine";

const SERIES = ["#a3e635", "#60a5fa", "#f472b6", "#facc15"];

export function StrengthRadar({ teams, scale = 10, height = 260 }: { teams: { name: string; rating: TeamRating }[]; scale?: number; height?: number }) {
  const dims: [string, keyof TeamRating][] = [
    ["Batting", "batting"],
    ["Bowling", "bowling"],
    ["All-round", "allrounder"],
    ["Keeping", "wicketkeeping"],
    ["Fielding", "fielding"],
  ];
  const data = dims.map(([label, key]) => {
    const row: Record<string, number | string> = { dim: label };
    teams.forEach((t) => (row[t.name] = (t.rating[key] as number | null) ?? 0));
    return row;
  });
  data.push({ dim: "Balance", ...Object.fromEntries(teams.map((t) => [t.name, (t.rating.balance / 100) * scale])) });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#2a2a30" />
        <PolarAngleAxis dataKey="dim" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, scale]} tick={false} axisLine={false} />
        {teams.map((t, i) => (
          <Radar key={t.name} name={t.name} dataKey={t.name} stroke={SERIES[i % 4]} fill={SERIES[i % 4]} fillOpacity={teams.length > 1 ? 0.08 : 0.2} strokeWidth={1.5} />
        ))}
        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #26262b", borderRadius: 8, fontSize: 12 }} formatter={(v) => Number(v).toFixed(2)} />
        {teams.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
      </RadarChart>
    </ResponsiveContainer>
  );
}
