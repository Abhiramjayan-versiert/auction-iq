export const metadata = { title: "Features" };

const groups = [
  { title: "For participants", items: ["Personal dashboard with live purse, rating and squad validity", "Competitor intelligence for every team with filters, sorting and multi-team comparison", "Competitor purse calculator with Official / Participant-entered / Estimated / Unverified labels", "Smart Bid ceilings with Aggressive, Balanced and Conservative strategies", "Player value analyzer (rating efficiency, value index, improvement)", "Private what-if simulator with three comparable strategies", "Predictive competitor analytics with evidence and confidence", "Configurable alerts (in-app and optional browser notifications)", "Private shortlist (target / backup / avoid), notes and reports"] },
  { title: "For auctioneers", items: ["Event-scoped dashboard and live control room", "Add players in seconds, import CSV / Excel, set base prices", "Record sales, unsold, undo the latest transaction and correct records", "Atomic, audited transactions — a player can never be sold twice", "Official purse and roster for every team", "Final reports and exports"] },
  { title: "For super admins", items: ["Platform analytics, users, roles and suspensions", "Multi-event management with isolated rules, teams and leaderboards", "Global player library and rating management", "Rule templates, platform defaults and audit logs"] },
];

export default function Features() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Features</h1>
      <p className="mt-2 text-muted">Everything an auction needs — and everything a participant needs to win it.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title} className="rounded-xl border border-line/70 bg-surface p-5">
            <h2 className="font-semibold text-accent">{g.title}</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {g.items.map((i) => <li key={i}>• {i}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
