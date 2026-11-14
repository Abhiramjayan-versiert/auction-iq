"use client";
import Link from "next/link";
import { useEventData } from "@/hooks/useEventData";
import { buttonVariants } from "@/components/ui/button";
import type { TeamAnalysis } from "@/lib/engine";
import { useWorkspace } from "@/hooks/useWorkspace";

/** Returns the current perspective team's analysis (with private observations merged), or a prompt. */
export function useMyTeam(): { me: TeamAnalysis | null; prompt: React.ReactNode } {
  const { myTeamId, event, teamMembers, userId } = useEventData();
  const { intel } = useWorkspace();
  const me = myTeamId ? intel.byId[myTeamId] ?? null : null;
  const own = teamMembers.some((m) => m.user_id === userId);
  const prompt = me ? null : (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-lg font-semibold">No team selected</h2>
      <p className="mt-1 text-sm text-muted">
        {own ? "Loading…" : event?.team_selection === "self_select" ? "Pick your team to unlock your personal workspace." : "The organiser will assign your team. Admins can use “View as team” in the header."}
      </p>
      {!own && event?.team_selection === "self_select" && (
        <Link href={`/e/${event.id}/select-team`} className={buttonVariants({ className: "mt-4" })}>Select team</Link>
      )}
    </div>
  );
  return { me, prompt };
}
