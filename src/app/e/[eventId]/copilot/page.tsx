"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, User } from "lucide-react";
import { askCopilot, COPILOT_DISCLAIMER, SUGGESTED_QUESTIONS, type CopilotAnswer } from "@/lib/engine";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

interface Msg { q: string; a: CopilotAnswer; at: string }

export default function Copilot() {
  const { myTeamId, players, event } = useEventData();
  const { intel, strategy } = useWorkspace();
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const key = `aiq-copilot-${event!.id}`;
  useEffect(() => {
    try {
      setMsgs(JSON.parse(sessionStorage.getItem(key) ?? "[]"));
    } catch {}
  }, [key]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);
  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const a = askCopilot(t, { a: intel, myTeamId, strategy, players });
    const next = [...msgs, { q: t, a, at: new Date().toISOString() }].slice(-30);
    setMsgs(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {}
    setQ("");
  };
  const tone = { calculated: "ok", estimate: "warn", prediction: "info", help: "neutral" } as const;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Auction Co-Pilot" description="Ask about the live auction. Answers are calculated from the recorded data — no guessing, and every answer shows its reasoning." />
      <Card className="p-3">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent/60 hover:text-fg cursor-pointer">{s}</button>
          ))}
        </div>
      </Card>
      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end"><div className="flex max-w-[85%] items-start gap-2 rounded-xl bg-surface-3 px-3 py-2 text-sm"><User size={14} className="mt-0.5 shrink-0 text-faint" />{m.q}</div></div>
            <Card className="p-3">
              <div className="flex items-start gap-2">
                <Bot size={16} className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><b>{m.a.topic}</b><Badge tone={tone[m.a.kind]}>{m.a.kind}</Badge>{m.a.kind !== "help" && <Badge>confidence: {m.a.confidence}</Badge>}</div>
                  <p className="mt-1 text-sm">{m.a.answer}</p>
                  {m.a.reasoning.length > 0 && (
                    <ul className={cn("mt-2 space-y-0.5 text-xs", m.a.kind === "help" ? "" : "list-disc pl-5 text-muted")}>
                      {m.a.reasoning.map((r) => (
                        <li key={r}>{m.a.kind === "help" ? <button className="text-accent cursor-pointer" onClick={() => ask(r)}>{r}</button> : r}</li>
                      ))}
                    </ul>
                  )}
                  {m.a.limitations.length > 0 && <p className="mt-2 text-[11px] text-warn">⚠ {m.a.limitations.join(" ")}</p>}
                </div>
              </div>
            </Card>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="sticky bottom-20 flex gap-2 rounded-xl border border-line bg-surface/95 p-2 backdrop-blur lg:bottom-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How much can Mumbai afford?" autoFocus />
        <Button aria-label="Ask"><Send size={15} /></Button>
      </form>
      <p className="text-[11px] text-faint">{COPILOT_DISCLAIMER} No AI service is required; an optional language model could be added later to rephrase these answers, never to change the numbers.</p>
    </div>
  );
}
