"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/utils";

interface Preview {
  id: string;
  name: string;
  organization: string | null;
  venue: string | null;
  starts_at: string | null;
  status: string;
  requires_approval: boolean;
  team_selection: string;
  teams_count: number;
  membership_status: string | null;
}

/** Two-step join: preview the event behind the code, then confirm — prevents joining the wrong auction. */
export function JoinFlow() {
  const router = useRouter();
  const [code, setCode] = useState(useSearchParams().get("code") ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const sb = supabaseBrowser();
  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await sb.rpc("preview_event_by_code", { p_code: code });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("No active auction matches that code. Check it with your organiser.");
    setPreview(data[0] as Preview);
  };
  const join = async () => {
    if (!preview) return;
    setBusy(true);
    const { data, error } = await sb.rpc("join_event", { p_code: code });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data === "pending") {
      toast.success("Request sent. The organiser must approve you.");
      router.push("/dashboard");
    } else {
      toast.success(`Joined ${preview.name}`);
      router.push(`/e/${preview.id}`);
    }
  };
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Join an auction or crew" description="Enter the invitation code from your organiser, or the crew code a teammate shared from their tracker." />
      <Card className="p-4">
        <form onSubmit={lookup} className="flex gap-2">
          <Input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); }} placeholder="e.g. YAM2026X" className="font-mono uppercase tracking-widest" required />
          <Button disabled={busy}>Find</Button>
        </form>
      </Card>
      {preview && (
        <Card className="mt-4 p-4">
          <div className="text-xs text-faint">Is this the right auction?</div>
          <div className="mt-1 text-lg font-semibold">{preview.name}</div>
          <div className="text-sm text-muted">{preview.organization ?? "—"} · {preview.venue ?? "Venue TBA"} · {fmtDate(preview.starts_at)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{preview.status}</Badge>
            <Badge>{preview.teams_count} teams</Badge>
            <Badge tone={preview.requires_approval ? "warn" : "ok"}>{preview.requires_approval ? "Approval required" : "Instant access"}</Badge>
            <Badge>{preview.team_selection === "self_select" ? "Pick your team" : "Team assigned by organiser"}</Badge>
          </div>
          {preview.membership_status ? (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted">You are already a member ({preview.membership_status}).</span>
              <Button size="sm" variant="secondary" onClick={() => router.push(`/e/${preview.id}`)}>Open</Button>
            </div>
          ) : (
            <Field label="" className="mt-4">
              <Button className="w-full" onClick={join} disabled={busy}>Yes, join {preview.name}</Button>
            </Field>
          )}
        </Card>
      )}
    </div>
  );
}
