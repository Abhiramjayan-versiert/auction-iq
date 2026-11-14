import { AppShell, type NavGroup } from "@/components/shell/AppShell";
import { requireProfile } from "@/lib/auth";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  const nav: NavGroup[] = [
    {
      items: [
        { href: "/dashboard", label: "My auctions", icon: "dashboard" },
        { href: "/join", label: "Join auction / crew", icon: "gavel" },
        { href: "/trackers/new", label: "New tracker", icon: "calc" },
        { href: "/events", label: "Discover events", icon: "events" },
        { href: "/profile", label: "Profile", icon: "settings" },
      ],
    },
  ];
  if (profile.platform_role !== "participant") nav.push({ title: "Auctioneer", items: [{ href: "/manage", label: "Assigned events", icon: "gavel" }] });
  if (profile.platform_role === "super_admin") nav.push({ title: "Platform", items: [{ href: "/admin", label: "Super Admin", icon: "gauge" }] });
  return (
    <AppShell nav={nav} user={{ name: profile.full_name, email: profile.email, role: profile.platform_role }}>
      {children}
    </AppShell>
  );
}
