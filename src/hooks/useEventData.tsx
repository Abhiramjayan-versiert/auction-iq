"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyseEvent, type EventAnalysis, type EventSnapshot, type Player, type RuleSet, type Team } from "@/lib/engine";
import { toPlayer, toRuleSet, toTeam, toTx } from "@/lib/data/mappers";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  AuctionRulesRow,
  EventRow,
  PlayerRow,
  RuleConstraintRow,
  SessionRow,
  TeamMemberRow,
  TeamRow,
  TransactionRow,
} from "@/lib/types/db";

export interface EventData {
  loading: boolean;
  error: string | null;
  connected: boolean;
  event: EventRow | null;
  rules: RuleSet;
  teams: Team[];
  teamRows: TeamRow[];
  players: Player[];
  playerRows: PlayerRow[];
  transactions: TransactionRow[];
  session: SessionRow | null;
  teamMembers: TeamMemberRow[];
  snapshot: EventSnapshot;
  analysis: EventAnalysis;
  userId: string | null;
  myTeamId: string | null;
  canManage: boolean;
  /** this user's membership role in the event (null for Super Admins without membership) */
  myRole: "auctioneer" | "participant" | "data_entry" | "analyst" | null;
  /** private tracker for an auction run outside the app */
  isTracker: boolean;
  /** tracker owner (manages crew) */
  isOwner: boolean;
  lastUpdated: Date | null;
  reload: () => Promise<void>;
  teamName: (id: string | null | undefined) => string;
  playerById: Record<string, Player>;
}

const Ctx = createContext<EventData | null>(null);

const EMPTY_RULES = toRuleSet(null, [], "Cr");

/**
 * Loads an event's official records and keeps them live via Supabase Realtime.
 * All analytics are recomputed client-side from the authoritative transactions.
 */
export function EventDataProvider({ eventId, perspectiveTeamId, children }: { eventId: string; perspectiveTeamId?: string | null; children: ReactNode }) {
  const sb = supabaseBrowser();
  const [state, setState] = useState<Omit<EventData, "snapshot" | "analysis" | "reload" | "teamName" | "playerById" | "myTeamId" | "isTracker" | "isOwner"> & { ownTeamId: string | null }>({
    loading: true,
    error: null,
    connected: false,
    event: null,
    rules: EMPTY_RULES,
    teams: [],
    teamRows: [],
    players: [],
    playerRows: [],
    transactions: [],
    session: null,
    teamMembers: [],
    userId: null,
    ownTeamId: null,
    canManage: false,
    myRole: null,
    lastUpdated: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id ?? null;
    const [ev, rules, cons, teams, players, txs, session, tm, manage, mine] = await Promise.all([
      sb.from("events").select("*, organizations(name)").eq("id", eventId).maybeSingle(),
      sb.from("auction_rules").select("*").eq("event_id", eventId).maybeSingle(),
      sb.from("rule_constraints").select("*").eq("event_id", eventId),
      sb.from("teams").select("*").eq("event_id", eventId).order("name"),
      sb.from("players").select("*, player_ratings(*)").eq("event_id", eventId).order("lot_number", { nullsFirst: false }).order("name"),
      sb.from("auction_transactions").select("*").eq("event_id", eventId).order("seq", { ascending: false }),
      sb.from("auction_sessions").select("*").eq("event_id", eventId).maybeSingle(),
      sb.from("team_members").select("*").eq("event_id", eventId),
      sb.rpc("can_manage_event", { p_event: eventId }),
      uid ? sb.from("event_members").select("role").eq("event_id", eventId).eq("user_id", uid).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const err = ev.error || rules.error || cons.error || teams.error || players.error || txs.error || session.error || tm.error;
    if (err || !ev.data) {
      setState((s) => ({ ...s, loading: false, error: err?.message ?? "Event not found or you do not have access." }));
      return;
    }
    const event = ev.data as EventRow;
    const teamRows = (teams.data ?? []) as TeamRow[];
    const playerRows = (players.data ?? []) as PlayerRow[];
    const members = (tm.data ?? []) as TeamMemberRow[];
    setState((s) => ({
      ...s,
      loading: false,
      error: null,
      event,
      rules: toRuleSet(rules.data as AuctionRulesRow | null, (cons.data ?? []) as RuleConstraintRow[], event.currency),
      teamRows,
      teams: teamRows.map(toTeam),
      playerRows,
      players: playerRows.map(toPlayer),
      transactions: (txs.data ?? []) as TransactionRow[],
      session: (session.data as SessionRow) ?? null,
      teamMembers: members,
      userId: uid,
      ownTeamId: members.find((m) => m.user_id === uid)?.team_id ?? null,
      canManage: Boolean(manage.data),
      myRole: ((mine.data as { role?: EventData["myRole"] } | null)?.role ?? null) as EventData["myRole"],
      lastUpdated: new Date(),
    }));
  }, [eventId, sb]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 200);
  }, [load]);

  useEffect(() => {
    void load();
    const filter = `event_id=eq.${eventId}`;
    const ch = sb.channel(`event-${eventId}`);
    for (const table of ["auction_transactions", "auction_sessions", "players", "teams", "team_members", "team_financials", "auction_rules", "rule_constraints", "event_members"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table, filter }, schedule);
    }
    ch.subscribe((status) => {
      setState((s) => ({ ...s, connected: status === "SUBSCRIBED" }));
      // After a reconnect, re-sync everything we may have missed.
      if (status === "SUBSCRIBED") schedule();
    });
    const onWake = () => schedule();
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
      void sb.removeChannel(ch);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [eventId, load, schedule, sb]);

  const myTeamId = perspectiveTeamId && state.teams.some((t) => t.id === perspectiveTeamId) ? perspectiveTeamId : state.ownTeamId;

  const derived = useMemo(() => {
    const snapshot: EventSnapshot = {
      rules: state.rules,
      teams: state.teams,
      players: state.players,
      transactions: state.transactions.map(toTx),
    };
    const analysis = analyseEvent(snapshot);
    const names = Object.fromEntries(state.teams.map((t) => [t.id, t.short_name || t.name]));
    const playerById = Object.fromEntries(state.players.map((p) => [p.id, p]));
    return { snapshot, analysis, teamName: (id: string | null | undefined) => (id ? names[id] ?? "—" : "—"), playerById };
  }, [state.rules, state.teams, state.players, state.transactions]);

  const isTracker = state.event?.mode === "tracker";
  const isOwner = Boolean(isTracker && state.userId && state.event?.owner_id === state.userId);
  const value: EventData = { ...state, ...derived, myTeamId, isTracker, isOwner, reload: load };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEventData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEventData must be used inside EventDataProvider");
  return v;
}
