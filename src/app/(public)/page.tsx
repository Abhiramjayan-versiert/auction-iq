import Link from "next/link";
import { ArrowRight, Crosshair, FlaskConical, Gavel, Radio, ShieldCheck, Sparkles, Trophy, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const features = [
  { icon: Sparkles, title: "Smart Bid", body: "A bid ceiling for every player that protects money for your mandatory slots — with the full calculation shown." },
  { icon: Crosshair, title: "Competitor intelligence", body: "Every rival's purse, squad gaps, rule violations and bidding capacity on one screen, live." },
  { icon: FlaskConical, title: "What-if simulator", body: "Try purchases privately, compare three squad strategies and see your projected leaderboard position." },
  { icon: Wallet, title: "Purse planner", body: "Reserves, discretionary budget and purse utilisation calculated automatically after every sale." },
  { icon: Trophy, title: "Live leaderboard", body: "Official ranking by the event's own formula, kept separate from analytical strength scores." },
  { icon: Gavel, title: "Auction control room", body: "Auctioneers record sales in seconds. Atomic transactions, undo and corrections with a full audit log." },
];

export default function Landing() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
          <Radio size={12} className="text-accent" /> Built for college management fests & intercollegiate auctions
        </div>
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Out-think every team <span className="text-accent">in the auction room.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          AUCTION IQ runs IPL-style auctions for organisers and gives every participant a private, real-time decision-support
          workspace — purse maths, rule checks, competitor tracking and bid recommendations, without a single spreadsheet formula.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register" className={buttonVariants({ size: "lg" })}>Create free account <ArrowRight size={16} /></Link>
          <Link href="/join" className={buttonVariants({ size: "lg", variant: "outline" })}>I have an invite code</Link>
        </div>
        <div className="mt-14 grid gap-3 sm:grid-cols-3">
          {[
            ["40+", "teams per auction"],
            ["200+", "players per event"],
            ["0", "formulas to maintain"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl border border-line/70 bg-surface p-5">
              <div className="text-3xl font-semibold text-accent tabular">{v}</div>
              <div className="text-sm text-muted">{l}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="border-t border-line/60 bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-line/70 bg-surface p-5">
              <f.icon size={18} className="text-accent" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-line/70 bg-surface p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-accent"><ShieldCheck size={16} /> Private by design</div>
            <h2 className="mt-2 text-2xl font-semibold">Your strategy stays yours.</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">Notes, shortlists, simulations and observations are protected by row-level security — no other participant can see them.</p>
          </div>
          <Link href="/how-it-works" className={buttonVariants({ variant: "secondary" })}>How it works</Link>
        </div>
      </section>
    </main>
  );
}
