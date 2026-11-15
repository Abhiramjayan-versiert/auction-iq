"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ClipboardPaste, CloudOff, RefreshCw, Save, Undo2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, CATEGORY_LABEL, fmtMoney, fmtRating } from "@/lib/engine";
import { checkName, emptyDraft, parsePastedRows, validateDraft, type EntryDraft, type PastedRow } from "@/lib/data/liveEntry";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEventData } from "@/hooks/useEventData";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TeamChip } from "@/components/domain/team";
import { TeamCombobox } from "@/components/entry/TeamCombobox";
import { EntryGrid, type GridRow } from "@/components/entry/EntryGrid";
import { BulkPasteDialog } from "@/components/entry/BulkPasteDialog";
import { useEntryQueue } from "@/components/entry/useEntryQueue";
import { cn, fmtTime } from "@/lib/utils";

/**
 * LIVE AUCTION DATA ENTRY — the operator's spreadsheet.
 * Four essentials per sale: player name, rating, winning team, sold price. Everything else is optional.
 * Players are created on the fly; nothing has to be uploaded before the auction.
 */
export default function LiveEntryPage() {
  const { event, rules, teams, players, playerRows, transactions, analysis, teamName, reload, connected, session } = useEventData();
  const eid = event!.id;
  const m = (n: number | null | undefined) => fmtMoney(n, rules.currency);
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft());
  const [more, setMore] = useState(false);
  const [paste, setPaste] = useState<PastedRow[] | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const ratingRef = useRef<HTMLInputElement>(null);
  const teamRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const onSaved = useCallback(() => void reload(), [reload]);
  const queue = useEntryQueue(eid, onSaved);

  useEffect(() => {
    try {
      setMore(localStorage.getItem("aiq-entry-more") === "1");
    } catch {}
  }, []);
  const toggleMore = () => {
    setMore(!more);
    try {
      localStorage.setItem("aiq-entry-more", more ? "0" : "1");
    } catch {}
  };

  const playerLite = useMemo(() => players.map((p) => ({ id: p.id, name: p.name, auction_status: p.auction_status, sold_team_id: p.sold_team_id, sold_price: p.sold_price, overall: p.overall })), [players]);
  const nameCheck = useMemo(() => checkName(draft.name, playerLite), [draft.name, playerLite]);
  const v = useMemo(() => validateDraft(draft, { scale: rules.rating_scale_max, players: playerLite }), [draft, rules.rating_scale_max, playerLite]);
  const pendingDup = draft.name.trim() && queue.pendingNames.has(draft.name.trim().replace(/\s+/g, " ").toLowerCase());
  const teamPurse = draft.team ? analysis.byId[draft.team] : null;
  const priceWarn =
    teamPurse && teamPurse.purseKnown && draft.price && Number(draft.price) > teamPurse.remaining
      ? `${teamPurse.team.name} only has ${m(teamPurse.remaining)} left${rules.allow_overspend ? " (overspend allowed)" : " — the server will reject this"}.`
      : null;

  // autofill rating/category of an existing (unsold) player the operator is re-entering
  useEffect(() => {
    if (nameCheck.kind === "existing" && !draft.rating && nameCheck.player.overall != null) setDraft((d) => ({ ...d, rating: String(nameCheck.player.overall) }));
  }, [nameCheck]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (pendingDup) return toast.error("This player is already waiting to be saved.");
    if (!v.payload) {
      toast.error(v.errors[0]);
      if (!draft.name.trim()) nameRef.current?.focus();
      else if (v.errors.some((e) => e.startsWith("Rating"))) ratingRef.current?.focus();
      else if (!draft.team && draft.status === "sold") teamRef.current?.focus();
      else priceRef.current?.focus();
      return;
    }
    queue.enqueue(v.payload, `${v.payload.p_name}${v.payload.p_status === "sold" ? ` → ${teamName(v.payload.p_team)} ${v.payload.p_amount}` : " (unsold)"}`);
    setDraft((d) => ({ ...emptyDraft(), status: d.status === "unsold" ? "sold" : "sold" }));
    requestAnimationFrame(() => nameRef.current?.focus());
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (text.includes("\t") || text.trim().includes("\n")) {
      e.preventDefault();
      const rows = parsePastedRows(text, teams);
      if (rows.length) setPaste(rows);
    }
  };

  const undo = useCallback(async () => {
    const last = transactions.find((t) => t.status === "active");
    if (!last) return toast.info("Nothing to undo");
    const p = players.find((x) => x.id === last.player_id);
    if (!confirm(`Undo the last entry: ${p?.name ?? "player"} ${last.type === "sale" ? `→ ${teamName(last.team_id)} for ${last.amount}` : "(unsold)"}? It is kept in history as reversed.`)) return;
    const { error } = await supabaseBrowser().rpc("undo_last_transaction", { p_event: eid });
    if (error) return toast.error(error.message);
    toast.success("Last entry undone — purses and ratings recalculated");
    await reload();
  }, [transactions, players, teamName, eid, reload]);

  // Ctrl/Cmd+Z undoes the last official entry when not typing in a field
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        void undo();
      }
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        nameRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo]);

  const playerById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const rows: GridRow[] = useMemo(() => {
    const chrono = [...transactions].sort((a, b) => a.seq - b.seq);
    return chrono.filter((t) => playerById[t.player_id]).map((t, i) => ({ no: i + 1, tx: t, player: playerById[t.player_id] }));
  }, [transactions, playerById]);
  const active = transactions.filter((t) => t.status === "active");
  const sold = active.filter((t) => t.type === "sale");
  const unsold = active.filter((t) => t.type === "unsold");
  const spend = sold.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const last = active[0];
  const failed = queue.items.filter((i) => i.status === "error");
  const waiting = queue.items.filter((i) => i.status !== "error");
  const teamOptions = useMemo(() => teams.map((t) => ({ ...t, remaining: analysis.byId[t.id]?.purseKnown ? m(analysis.byId[t.id].remaining) : "purse not set" })), [teams, analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPurse = async (teamId: string, current: number | null) => {
    const v = prompt(`Initial purse for ${teamName(teamId)} (${rules.currency})`, current === null ? "" : String(current));
    if (v === null) return;
    const n = v.trim() === "" ? null : Number(v);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return toast.error("Enter a positive number, or leave empty for unknown");
    const { error } = await supabaseBrowser().from("teams").update({ initial_purse: n }).eq("id", teamId);
    if (error) return toast.error(error.message);
    toast.success("Purse updated — balances recalculated");
    await reload();
  };

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {[
          ["Players entered", players.length],
          ["Sold", sold.length],
          ["Unsold", unsold.length],
          ["Teams", teams.length],
          ["Total spending", m(spend)],
          ["Event status", event!.status === "live" || !session ? event!.status : session.status.replace("_", " ")],
        ].map(([k, val]) => (
          <div key={String(k)} className="rounded-lg border border-line/60 bg-surface px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-faint">{k}</div>
            <div className="tabular text-base font-semibold">{val}</div>
          </div>
        ))}
        <div className="col-span-2 rounded-lg border border-line/60 bg-surface px-3 py-2">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-faint">
            <span>Last entry</span>
            <span className={cn("inline-flex items-center gap-1 normal-case", connected && queue.online ? "text-ok" : "text-warn")}>
              {connected && queue.online ? <Wifi size={11} /> : <CloudOff size={11} />}
              {queue.online ? (connected ? "Live" : "Reconnecting") : "Offline — entries queued"}
            </span>
          </div>
          <div className="truncate text-sm">
            {last ? (
              <>
                <b>{playerById[last.player_id]?.name}</b> {last.type === "sale" ? `→ ${teamName(last.team_id)} · ${m(last.amount)}` : "· unsold"} <span className="text-xs text-faint">{fmtTime(last.created_at)}</span>
              </>
            ) : (
              <span className="text-muted">No entries yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Quick entry */}
      <Card className="border-accent/30 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Quick entry</span>
          <span className="text-xs text-faint">Tab between fields · Enter saves · paste rows from Excel into the name box · “/” jumps here · Ctrl/⌘+Z undoes the last entry</span>
          <div className="ml-auto flex gap-1">
            {(["sold", "unsold"] as const).map((s) => (
              <button key={s} onClick={() => setDraft({ ...draft, status: s })} className={cn("rounded-md px-3 py-1 text-xs font-medium cursor-pointer", draft.status === s ? (s === "sold" ? "bg-accent text-accent-ink" : "bg-warn text-black") : "bg-surface-3 text-muted")}>
                {s === "sold" ? "Sold" : "Unsold"}
              </button>
            ))}
          </div>
        </div>
        <div className={cn("grid gap-2", draft.status === "sold" ? "md:grid-cols-[2fr_0.8fr_1.6fr_1fr_auto]" : "md:grid-cols-[2fr_0.8fr_auto]")}>
          <div>
            <Input ref={nameRef} autoFocus className="h-10 text-base" placeholder="Player name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={onEnter} onPaste={onPaste} list="aiq-known-players" aria-label="Player name" autoComplete="off" />
            <datalist id="aiq-known-players">{players.filter((p) => p.auction_status !== "sold").map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </div>
          <Input ref={ratingRef} className="h-10 text-base tabular" type="number" step="0.01" min={0} max={rules.rating_scale_max} placeholder={`Rating /${rules.rating_scale_max}`} value={draft.rating} onChange={(e) => setDraft({ ...draft, rating: e.target.value })} onKeyDown={onEnter} aria-label="Rating" />
          {draft.status === "sold" && (
            <>
              <TeamCombobox ref={teamRef} teams={teamOptions} value={draft.team} onChange={(id) => setDraft({ ...draft, team: id })} onEnter={save} placeholder="Winning team (type to search)" className="text-base" />
              <Input ref={priceRef} className="h-10 text-base tabular" type="number" step="any" min={0} placeholder={`Sold price (${rules.currency})`} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} onKeyDown={onEnter} aria-label="Sold price" />
            </>
          )}
          <Button size="lg" className="h-10" onClick={save}><Save size={16} /> Save</Button>
        </div>
        <button onClick={toggleMore} className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer">
          {more ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Optional details (category, IN/OS, nationality, base price)
        </button>
        {more && (
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as EntryDraft["category"] })} aria-label="Category">
              <option value="">Category: not recorded</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
            <Select value={draft.origin} onChange={(e) => setDraft({ ...draft, origin: e.target.value as EntryDraft["origin"] })} aria-label="Indian or overseas">
              <option value="">IN/OS: not recorded</option>
              <option value="indian">Indian</option>
              <option value="overseas">Overseas</option>
            </Select>
            <Input placeholder="Nationality" value={draft.nationality} onChange={(e) => setDraft({ ...draft, nationality: e.target.value, origin: draft.origin || (e.target.value.trim() ? (/^india/i.test(e.target.value.trim()) ? "indian" : "overseas") : "") })} onKeyDown={onEnter} />
            <Input type="number" step="any" min={0} placeholder="Base price" value={draft.base} onChange={(e) => setDraft({ ...draft, base: e.target.value })} onKeyDown={onEnter} />
          </div>
        )}
        <div className="mt-2 min-h-5 space-y-1 text-xs">
          {nameCheck.kind === "sold" && <div className="text-danger"><AlertTriangle size={12} className="inline" /> {nameCheck.player.name} is already sold to {teamName(nameCheck.player.sold_team_id)} for {m(nameCheck.player.sold_price)} — edit that row below instead.</div>}
          {nameCheck.kind === "existing" && <div className="text-info">Existing player ({nameCheck.player.auction_status}, rating {fmtRating(nameCheck.player.overall)}) — this entry will update the same record, not create a duplicate.</div>}
          {nameCheck.kind === "similar" && <div className="text-warn">Similar name already entered: {nameCheck.players.map((p) => p.name).join(", ")}. Check for a typo before saving.</div>}
          {pendingDup && <div className="text-warn">This player is already in the save queue.</div>}
          {priceWarn && <div className="text-warn">{priceWarn}</div>}
          {draft.name && v.warnings.map((w) => <div key={w} className="text-faint">{w}</div>)}
        </div>
      </Card>

      {/* Queue: never silently lose a submission */}
      {queue.items.length > 0 && (
        <Card className={cn("p-3", failed.length ? "border-danger/40" : "border-warn/40")}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {waiting.length > 0 && <Badge tone="warn"><RefreshCw size={11} className="animate-spin" /> {waiting.length} saving / waiting for connection</Badge>}
            {failed.length > 0 && <Badge tone="danger">{failed.length} not saved — needs attention</Badge>}
            <span className="text-xs text-faint">Unsaved entries are kept on this device until the server confirms them.</span>
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            {queue.items.map((i) => (
              <li key={i.clientRef} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.label}</span>
                {i.status === "error" ? (
                  <>
                    <span className="text-danger">{i.error}</span>
                    <button className="text-accent cursor-pointer" onClick={() => queue.retry(i.clientRef)}>Retry</button>
                    <button
                      className="text-muted cursor-pointer"
                      onClick={() => {
                        setDraft({
                          name: i.payload.p_name, rating: i.payload.p_rating?.toString() ?? "", team: i.payload.p_team ?? "", price: i.payload.p_amount?.toString() ?? "",
                          status: i.payload.p_status, category: i.payload.p_category ?? "", origin: i.payload.p_origin ?? "", nationality: i.payload.p_nationality ?? "", base: i.payload.p_base_price?.toString() ?? "",
                        });
                        queue.discard(i.clientRef);
                        nameRef.current?.focus();
                      }}
                    >
                      Edit in quick entry
                    </button>
                    <button className="text-faint hover:text-danger cursor-pointer" onClick={() => confirm("Discard this unsaved entry?") && queue.discard(i.clientRef)}>Discard</button>
                  </>
                ) : (
                  <span className="text-warn">{i.status === "saving" ? "saving…" : i.attempts ? `retrying (attempt ${i.attempts + 1})` : "queued"}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Grid */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-sm font-semibold">All entries</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              const text = prompt("Paste rows copied from Excel / Google Sheets here (or paste straight into the player-name box):");
              if (text) {
                const rows = parsePastedRows(text, teams);
                if (rows.length) setPaste(rows);
              }
            }}><ClipboardPaste size={14} /> Bulk paste</Button>
            <Button size="sm" variant="outline" onClick={undo} disabled={!active.length}><Undo2 size={14} /> Undo last</Button>
          </div>
        </div>
        <EntryGrid rows={rows} teams={teams} teamName={teamName} currency={rules.currency} scale={rules.rating_scale_max} onChanged={reload} latestActiveId={last?.id ?? null} />
      </Card>

      {/* Team purses */}
      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Team purses</span>
          <span className="text-xs text-faint">Click a purse to set or change it</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="text-left text-[11px] uppercase text-faint"><th className="py-1">Team</th><th className="text-right">Players bought</th><th className="text-right">Total spent</th><th className="text-right">Initial purse</th><th className="text-right">Remaining purse</th><th className="text-right">Avg rating</th></tr></thead>
            <tbody>
              {analysis.teams.map((t) => {
                const row = playerRows.length >= 0 ? teams.find((x) => x.id === t.team.id) : null;
                return (
                  <tr key={t.team.id} className={cn("border-t border-line/40", draft.team === t.team.id && "bg-accent/5")}>
                    <td className="py-1.5"><TeamChip team={t.team} /></td>
                    <td className="text-right">{t.rating.count}</td>
                    <td className="text-right">{m(t.spent)}</td>
                    <td className="text-right">
                      <button className="hover:text-accent cursor-pointer" onClick={() => setPurse(t.team.id, row?.initial_purse ?? null)}>{t.purseKnown ? m(t.initialPurse) : <Badge tone="warn">set purse</Badge>}</button>
                    </td>
                    <td className={cn("text-right font-semibold", t.purseKnown && t.remaining < 0 && "text-danger")}>{t.purseKnown ? m(t.remaining) : "—"}</td>
                    <td className="text-right">{fmtRating(t.rating.average)}{t.rating.count > t.rating.ratedCount && <span className="ml-1 text-[10px] text-faint">({t.rating.ratedCount}/{t.rating.count} rated)</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {paste && (
        <BulkPasteDialog
          rows={paste}
          teams={teams}
          players={playerLite}
          scale={rules.rating_scale_max}
          onClose={() => setPaste(null)}
          onSubmit={(items) => {
            items.forEach((i) => queue.enqueue(i.payload, i.label));
            toast.success(`${items.length} row(s) queued for saving`);
            setPaste(null);
          }}
        />
      )}
      <p className="flex items-center gap-1 text-[11px] text-faint"><CheckCircle2 size={11} /> Every save is validated and recorded atomically on the server; participants see it within a second.</p>
    </div>
  );
}
