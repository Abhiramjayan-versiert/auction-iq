"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ActivityChart({ registrations, activity }: { registrations: { day: string; count: number }[]; activity: { day: string; count: number }[] }) {
  const days = new Map<string, { day: string; registrations: number; activity: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.set(d, { day: d.slice(5), registrations: 0, activity: 0 });
  }
  registrations.forEach((r) => days.get(r.day) && (days.get(r.day)!.registrations = r.count));
  activity.forEach((r) => days.get(r.day) && (days.get(r.day)!.activity = r.count));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={[...days.values()]}>
        <CartesianGrid stroke="#26262b" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 10 }} interval={4} />
        <YAxis tick={{ fill: "#71717a", fontSize: 10 }} allowDecimals={false} width={28} />
        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #26262b", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "#ffffff08" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="registrations" fill="#a3e635" radius={[3, 3, 0, 0]} />
        <Bar dataKey="activity" fill="#60a5fa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
