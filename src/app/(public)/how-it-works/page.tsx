export const metadata = { title: "How it works" };

const steps = [
  ["Organiser sets up the event", "A Super Admin creates the event, assigns an auctioneer and configures purse limits, squad rules and the official ranking formula."],
  ["Participants join with a code", "Register, enter the invitation code, confirm the event details and claim (or receive) your team."],
  ["Auctioneer records the auction", "The auctioneer selects each player and records the real result from the room — sold to whom and for how much, or unsold."],
  ["Everyone's analytics update instantly", "Purses, ratings, rule checks, rankings and recommendations recompute from the official transactions for every connected participant."],
  ["You decide better", "Use Smart Bid, the simulator and competitor intelligence privately to plan every bid."],
];

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">How it works</h1>
      <ol className="mt-10 space-y-4">
        {steps.map(([t, b], i) => (
          <li key={t} className="flex gap-4 rounded-xl border border-line/70 bg-surface p-5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">{i + 1}</span>
            <div>
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-xs text-faint">AUCTION IQ never detects physical bids or fabricates player data. Ratings come from the organiser or a trusted source, and official results are entered by the auctioneer.</p>
    </main>
  );
}
