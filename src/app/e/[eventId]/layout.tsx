import { requireEventMember } from "@/lib/auth";
import { ParticipantShell } from "@/components/participant/ParticipantShell";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { profile } = await requireEventMember(eventId);
  return (
    <ParticipantShell eventId={eventId} user={{ name: profile.full_name, email: profile.email, role: profile.platform_role }}>
      {children}
    </ParticipantShell>
  );
}
