"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { friendlyDbError, isNetworkError, type EntryPayload } from "@/lib/data/liveEntry";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface QueueItem {
  clientRef: string;
  payload: EntryPayload;
  label: string;
  status: "pending" | "saving" | "error";
  error?: string;
  attempts: number;
  createdAt: number;
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

/**
 * Durable submission queue for the operator. Every entry gets a client_ref (idempotency key),
 * is persisted in localStorage until the server confirms it, and is retried automatically after
 * network failures. Validation errors from the server stop the item for the operator to fix.
 * A submitted transaction is never silently lost.
 */
export function useEntryQueue(eventId: string, onSaved: () => void) {
  const key = `aiq-entry-queue-${eventId}`;
  const [items, setItems] = useState<QueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const busy = useRef(false);
  const itemsRef = useRef<QueueItem[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (next: QueueItem[]) => {
      itemsRef.current = next;
      setItems(next);
      try {
        localStorage.setItem(key, JSON.stringify(next.map((i) => ({ ...i, status: i.status === "saving" ? "pending" : i.status }))));
      } catch {}
    },
    [key],
  );

  const process = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((i) => i.status === "pending");
        if (!next) break;
        persist(itemsRef.current.map((i) => (i.clientRef === next.clientRef ? { ...i, status: "saving" } : i)));
        const { data, error } = await supabaseBrowser().rpc("record_live_entry", { p_event: eventId, ...next.payload, p_client_ref: next.clientRef });
        if (error) {
          if (isNetworkError(error)) {
            setOnline(false);
            persist(itemsRef.current.map((i) => (i.clientRef === next.clientRef ? { ...i, status: "pending", attempts: i.attempts + 1 } : i)));
            const delay = Math.min(15000, 1000 * 2 ** Math.min(next.attempts, 4));
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void process(), delay);
            break;
          }
          const msg = friendlyDbError(error.message);
          persist(itemsRef.current.map((i) => (i.clientRef === next.clientRef ? { ...i, status: "error", error: msg } : i)));
          toast.error(`${next.label}: ${msg}`);
          continue;
        }
        setOnline(true);
        persist(itemsRef.current.filter((i) => i.clientRef !== next.clientRef));
        const d = data as { created_player?: boolean; duplicate_submission?: boolean } | null;
        toast.success(`Saved: ${next.label}${d?.created_player ? " (new player)" : ""}`, { duration: 1500 });
        onSaved();
      }
    } finally {
      busy.current = false;
    }
  }, [eventId, onSaved, persist]);

  // restore unsynchronised entries after a refresh / crash
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as QueueItem[];
      if (saved.length) {
        persist(saved);
        toast.info(`${saved.length} unsynchronised entr${saved.length === 1 ? "y" : "ies"} restored — retrying.`);
      }
    } catch {}
    const up = () => {
      setOnline(true);
      void process();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (items.some((i) => i.status === "pending")) void process();
  }, [items, process]);

  const enqueue = useCallback(
    (payload: EntryPayload, label: string) => {
      const item: QueueItem = { clientRef: uuid(), payload, label, status: "pending", attempts: 0, createdAt: Date.now() };
      persist([...itemsRef.current, item]);
      return item.clientRef;
    },
    [persist],
  );
  const retry = (ref: string, payload?: EntryPayload) => persist(itemsRef.current.map((i) => (i.clientRef === ref ? { ...i, payload: payload ?? i.payload, status: "pending", error: undefined } : i)));
  const discard = (ref: string) => persist(itemsRef.current.filter((i) => i.clientRef !== ref));
  return { items, online, enqueue, retry, discard, pendingNames: new Set(items.map((i) => i.payload.p_name.toLowerCase())) };
}
