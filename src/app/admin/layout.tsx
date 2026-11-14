import { AppShell, type NavGroup } from "@/components/shell/AppShell";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSuperAdmin();
  const nav: NavGroup[] = [
    { items: [{ href: "/admin", label: "Platform dashboard", icon: "gauge", exact: true }] },
    {
      title: "Manage",
      items: [
        { href: "/admin/users", label: "Users", icon: "members" },
        { href: "/admin/events", label: "Events & auctions", icon: "events" },
        { href: "/admin/players", label: "Player database", icon: "database" },
        { href: "/admin/templates", label: "Rule templates", icon: "templates" },
      ],
    },
    { title: "Platform", items: [{ href: "/admin/settings", label: "Global settings", icon: "settings" }, { href: "/admin/audit", label: "Audit logs", icon: "audit" }] },
    { items: [{ href: "/manage", label: "Auctioneer view", icon: "gavel" }, { href: "/dashboard", label: "My auctions", icon: "dashboard" }] },
  ];
  return (
    <AppShell nav={nav} user={{ name: profile.full_name, email: profile.email, role: profile.platform_role }} header={<span className="text-sm font-semibold">Super Admin</span>}>
      {children}
    </AppShell>
  );
}
