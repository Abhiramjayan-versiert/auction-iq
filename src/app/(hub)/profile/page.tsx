import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "./ProfileForm";
export const metadata = { title: "Profile" };
export default async function Page() {
  const { profile } = await requireProfile("/profile");
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Profile" description={profile.email} />
      <ProfileForm profile={profile} />
    </div>
  );
}
