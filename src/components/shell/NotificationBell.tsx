"use client";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/types/db";
import { cn, fmtDate } from "@/lib/utils";

/** In-app notifications: personal + event broadcasts, updated in real time. */
export function NotificationBell({ eventId }: { eventId?: string }) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const seenKey = `aiq-seen-${eventId ?? "global"}`;
  const [seenAt, setSeenAt] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    setUid(u.user.id);
    let q = sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
    q = eventId ? q.or(`user_id.eq.${u.user.id},event_id.eq.${eventId}`) : q.or(`user_id.eq.${u.user.id},and(user_id.is.null,event_id.is.null)`);
    const { data } = await q;
    setItems((data ?? []) as NotificationRow[]);
  }, [sb, eventId]);

  useEffect(() => {
    try {
      setSeenAt(localStorage.getItem(seenKey) ?? "");
    } catch {}
    void load();
    const ch = sb.channel(`notif-${eventId ?? "global"}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => void load()).subscribe();
    return () => void sb.removeChannel(ch);
  }, [load, sb, eventId, seenKey]);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = items.filter((n) => (n.user_id === uid ? !n.read_at : n.created_at > seenAt)).length;
  const markAll = async () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(seenKey, now);
    } catch {}
    setSeenAt(now);
    if (uid) await sb.from("notifications").update({ read_at: now }).eq("user_id", uid).is("read_at", null);
    void load();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Notifications">
        <Bell size={17} />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-ink">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line/70 px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button onClick={markAll} className="text-xs text-accent cursor-pointer">Mark all read</button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="p-4 text-center text-xs text-muted">Nothing yet.</li>}
            {items.map((n) => (
              <li key={n.id} className="border-b border-line/40 px-3 py-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", n.level === "critical" ? "bg-danger" : n.level === "warning" ? "bg-warn" : n.level === "success" ? "bg-ok" : "bg-info")} />
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                <p className="mt-0.5 text-[10px] text-faint">{fmtDate(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
