"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { NavIcon, type IconName } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
}
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export function AppShell({
  nav,
  children,
  header,
  user,
  eventId,
}: {
  nav: NavGroup[];
  children: ReactNode;
  header?: ReactNode;
  user: { name: string; email: string; role: string };
  eventId?: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isActive = (i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  };
  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/dashboard"><Logo /></Link>
        <button className="lg:hidden text-muted" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {nav.map((g, gi) => (
          <div key={gi} className="mt-3">
            {g.title && <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">{g.title}</div>}
            {g.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive(i) ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <NavIcon name={i.icon} size={15} className={isActive(i) ? "text-accent" : ""} />
                {i.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-line/70 p-3">
        <div className="truncate text-sm font-medium">{user.name || user.email}</div>
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-faint">{user.role.replace("_", " ")}</span>
          <button onClick={signOut} className="flex items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer"><LogOut size={12} /> Sign out</button>
        </div>
      </div>
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line/70 bg-surface lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-64 border-r border-line bg-surface" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line/70 bg-bg/85 px-4 backdrop-blur">
          <button className="lg:hidden text-muted" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="min-w-0 flex-1">{header}</div>
          <NotificationBell eventId={eventId} />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
