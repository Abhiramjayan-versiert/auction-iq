"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TeamChip } from "@/components/domain/team";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { useMoney } from "@/components/participant/shared";
import { useEventData } from "@/hooks/useEventData";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SelectTeam() {
  const router = useRouter();
  const { event, teams, teamMembers, userId, reload } = useEventData();
  const m = useMoney();
  const mine = teamMembers.find((t) => t.user_id === userId);
  const claim = async (teamId: string) => {
    const { error } = await supabaseBrowser().rpc("claim_team", { p_event: event!.id, p_team: teamId });
    if (error) return toast.error(error.message);
    toast.success("Team claimed — welcome to your workspace");
    await reload();
    router.push(`/e/${event!.id}`);
  };
  return (
    <div>
      <PageHeader title="Select your team" description={event?.team_selection === "self_select" ? "Each team has one owner. Pick yours carefully — the organiser can reassign it later." : "Teams for this event are assigned by the organiser."} />
      {mine && <p className="mb-4 text-sm text-ok">You own {teams.find((t) => t.id === mine.team_id)?.name}.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {teams.map((t) => {
          const owner = teamMembers.find((m) => m.team_id === t.id && m.role === "owner");
          return (
            <Card key={t.id} className="p-4">
              <TeamChip team={t} className="text-base font-semibold" />
              <div className="mt-2 text-xs text-muted">Purse {m(t.initial_purse)}</div>
              <div className="mt-3">
                {owner ? (
                  <Badge tone={owner.user_id === userId ? "accent" : "neutral"}>{owner.user_id === userId ? "Your team" : "Claimed"}</Badge>
                ) : event?.team_selection === "self_select" && !mine ? (
                  <Button size="sm" onClick={() => claim(t.id)}>Claim team</Button>
                ) : (
                  <Badge>Available</Badge>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
