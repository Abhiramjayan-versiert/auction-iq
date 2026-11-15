"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { analyseEvent, DEFAULT_ALERT_PREFS, type AlertPrefs, type EventAnalysis, type RosterEntry, type Strategy } from "@/lib/engine";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { NoteRow, ObservationRow, ShortlistRow, SimRow, WorkspaceRow } from "@/lib/types/db";
import { useEventData } from "./useEventData";

interface Workspace {
  ready: boolean;
  workspace: WorkspaceRow | null;
  strategy: Strategy;
  alertPrefs: AlertPrefs;
  notes: NoteRow[];
  shortlist: ShortlistRow[];
  sims: SimRow[];
  observations: ObservationRow[];
  /** Official data merged with this participant's private observations (labelled). */
  intel: EventAnalysis;
  setStrategy: (s: Strategy) => Promise<void>;
  setAlertPrefs: (p: AlertPrefs) => Promise<void>;
  saveNote: (n: Partial<NoteRow> & { body: string }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  upsertShortlist: (playerId: string, list: ShortlistRow["list"], patch?: Partial<ShortlistRow>) => Promise<void>;
  removeShortlist: (playerId: string) => Promise<void>;
  watchByName: (name: string, patch?: Partial<ShortlistRow>) => Promise<void>;
  updateShortlist: (id: string, patch: Partial<ShortlistRow>) => Promise<void>;
  removeShortlistRow: (id: string) => Promise<void>;
  addSim: (s: Omit<SimRow, "id" | "user_id" | "event_id">) => Promise<void>;
  removeSim: (id: string) => Promise<void>;
  clearSims: (scenario: SimRow["scenario"]) => Promise<void>;
  addObservation: (o: Omit<ObservationRow, "id" | "user_id" | "event_id" | "created_at">) => Promise<void>;
  updateObservation: (id: string, patch: Partial<ObservationRow>) => Promise<void>;
  removeObservation: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const sb = supabaseBrowser();
  const { event, userId, snapshot, analysis, playerById } = useEventData();
  const eventId = event?.id;
  const [ws, setWs] = useState<WorkspaceRow | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [shortlist, setShortlist] = useState<ShortlistRow[]>([]);
  const [sims, setSims] = useState<SimRow[]>([]);
  const [observations, setObs] = useState<ObservationRow[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!eventId || !userId) return;
    const q = <T,>(t: string) => sb.from(t).select("*").eq("event_id", eventId).eq("user_id", userId) as unknown as Promise<{ data: T[] | null }>;
    let w = await sb.from("private_participant_workspaces").select("*").eq("event_id", eventId).eq("user_id", userId).maybeSingle();
    if (!w.data) {
      w = await sb.from("private_participant_workspaces").insert({ event_id: eventId, user_id: userId }).select().maybeSingle();
    }
    const [n, s, sim, o] = await Promise.all([q<NoteRow>("private_notes"), q<ShortlistRow>("player_shortlists"), q<SimRow>("simulated_transactions"), q<ObservationRow>("competitor_observations")]);
    setWs((w.data as WorkspaceRow) ?? null);
    setNotes(((n.data ?? []) as NoteRow[]).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setShortlist((s.data ?? []) as ShortlistRow[]);
    setSims((sim.data ?? []) as SimRow[]);
    setObs((o.data ?? []) as ObservationRow[]);
    setReady(true);
  }, [eventId, userId, sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const guard = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) {
      toast.error(error.message);
      throw error;
    }
    await load();
  };

  const intel = useMemo(() => {
    if (!observations.length) return analysis;
    const extra: Record<string, RosterEntry[]> = {};
    const overrides: Record<string, number> = {};
    for (const o of observations) {
      if (o.kind === "initial_purse") {
        overrides[o.team_id] = Number(o.amount);
        continue;
      }
      const official = o.player_id ? playerById[o.player_id] : undefined;
      const player = official ?? {
        id: `obs-${o.id}`,
        name: o.player_name || "Unnamed player",
        origin: "indian" as const,
        category: "BAT" as const,
        base_price: 0,
        overall: null,
        auction_status: "sold" as const,
      };
      (extra[o.team_id] ??= []).push({ player, price: Number(o.amount), source: o.label === "participant" ? "participant" : o.label });
    }
    return analyseEvent({ ...snapshot, extraEntries: extra, purseOverrides: overrides });
  }, [observations, analysis, snapshot, playerById]);

  const value: Workspace = {
    ready,
    workspace: ws,
    strategy: ws?.strategy ?? "balanced",
    alertPrefs: { ...DEFAULT_ALERT_PREFS, ...((ws?.alert_prefs ?? {}) as Partial<AlertPrefs>) },
    notes,
    shortlist,
    sims,
    observations,
    intel,
    reload: load,
    setStrategy: (strategy) => guard(sb.from("private_participant_workspaces").update({ strategy }).eq("id", ws!.id)),
    setAlertPrefs: (p) => guard(sb.from("private_participant_workspaces").update({ alert_prefs: p }).eq("id", ws!.id)),
    saveNote: (n) =>
      n.id
        ? guard(sb.from("private_notes").update({ body: n.body, title: n.title ?? null, player_id: n.player_id ?? null, team_id: n.team_id ?? null }).eq("id", n.id))
        : guard(sb.from("private_notes").insert({ ...n, event_id: eventId, user_id: userId })),
    deleteNote: (id) => guard(sb.from("private_notes").delete().eq("id", id)),
    upsertShortlist: (player_id, list, patch = {}) =>
      guard(
        sb.from("player_shortlists").upsert(
          { event_id: eventId, user_id: userId, player_id, list, ...patch },
          { onConflict: "user_id,event_id,player_id" },
        ),
      ),
    removeShortlist: (player_id) => guard(sb.from("player_shortlists").delete().eq("event_id", eventId!).eq("user_id", userId!).eq("player_id", player_id)),
    watchByName: (name, patch = {}) => guard(sb.from("player_shortlists").insert({ event_id: eventId, user_id: userId, player_id: null, player_name: name.trim(), list: "target", ...patch })),
    updateShortlist: (id, patch) => guard(sb.from("player_shortlists").update(patch).eq("id", id)),
    removeShortlistRow: (id) => guard(sb.from("player_shortlists").delete().eq("id", id)),
    addSim: (s) =>
      guard(sb.from("simulated_transactions").upsert({ ...s, event_id: eventId, user_id: userId }, { onConflict: "user_id,event_id,scenario,player_id" })),
    removeSim: (id) => guard(sb.from("simulated_transactions").delete().eq("id", id)),
    clearSims: (scenario) => guard(sb.from("simulated_transactions").delete().eq("event_id", eventId!).eq("user_id", userId!).eq("scenario", scenario)),
    addObservation: (o) => guard(sb.from("competitor_observations").insert({ ...o, event_id: eventId, user_id: userId })),
    updateObservation: (id, patch) => guard(sb.from("competitor_observations").update(patch).eq("id", id)),
    removeObservation: (id) => guard(sb.from("competitor_observations").delete().eq("id", id)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}
