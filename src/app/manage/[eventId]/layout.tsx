import { requireEventManager } from "@/lib/auth";
import { ManageShell } from "@/components/manage/ManageShell";

export default async function ManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { profile } = await requireEventManager(eventId);
  return (
    <ManageShell eventId={eventId} user={{ name: profile.full_name, email: profile.email, role: profile.platform_role }} isAdmin={profile.platform_role === "super_admin"}>
      {children}
    </ManageShell>
  );
}
