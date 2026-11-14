"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, Empty, Spinner } from "@/components/ui/misc";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { EventRow } from "@/lib/types/db";
import { fmtDate } from "@/lib/utils";

export default function Discover() {
  const sb = supabaseBrowser();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    (async () => {
      const { data: u } = await sb.auth.getUser();
      setAuthed(Boolean(u.user));
      if (!u.user) return;
      const { data } = await sb.from("events").select("*, organizations(name)").eq("visibility", "public").eq("is_active", true).neq("status", "archived").order("starts_at");
      setEvents((data ?? []) as EventRow[]);
    })();
  }, [sb]);
  const request = async (id: string) => {
    const { data, error } = await sb.rpc("request_join_event", { p_event: id });
    if (error) return toast.error(error.message);
    toast.success(data === "pending" ? "Request sent — awaiting approval" : "Joined! Open it from My auctions.");
  };
  const list = (events ?? []).filter((e) => (e.name + (e.organizations?.name ?? "") + (e.venue ?? "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Discover auctions</h1>
      <p className="mt-1 text-sm text-muted">Public auctions open to participants. Private auctions need an invitation code.</p>
      {authed === false && (
        <Card className="mt-6 flex items-center justify-between p-4">
          <span className="text-sm text-muted">Log in to browse and request to join events.</span>
          <Link href="/login?next=/events" className={buttonVariants({ size: "sm" })}>Log in</Link>
        </Card>
      )}
      {authed && (
        <>
          <Input className="mt-6 max-w-sm" placeholder="Search events, colleges, venues…" value={q} onChange={(e) => setQ(e.target.value)} />
          {!events ? <Spinner className="mt-6" /> : list.length === 0 ? <Empty className="mt-6" title="No public events right now" /> : (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {list.map((e) => (
                <Card key={e.id} className="p-4">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-semibold">{e.name}</div>
                      <div className="text-xs text-muted">{e.organizations?.name ?? "—"} · {e.venue ?? "Venue TBA"} · {fmtDate(e.starts_at)}</div>
                    </div>
                    <Badge tone={e.status === "live" ? "accent" : "neutral"}>{e.status}</Badge>
                  </div>
                  {e.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{e.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <Badge tone={e.requires_approval ? "warn" : "ok"}>{e.requires_approval ? "Approval required" : "Open"}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => request(e.id)}>Request to join</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
