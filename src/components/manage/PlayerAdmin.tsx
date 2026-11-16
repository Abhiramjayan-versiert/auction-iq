"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Download, Library, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, CATEGORY_LABEL, fmtRating, type Category } from "@/lib/engine";
import { ratingOf } from "@/lib/data/mappers";
import { parsePlayerSheet, PLAYER_TEMPLATE_HEADERS, type ImportedPlayer } from "@/lib/data/importPlayers";
import { rpc } from "@/lib/data/rpc";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PlayerRow } from "@/lib/types/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Dialog, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/table";
import { AuctionStatusBadge, CategoryBadge } from "@/components/domain/badges";
import { downloadCsv } from "@/lib/utils";

const RATING_KEYS = ["overall", "batting", "bowling", "fielding", "wicketkeeping", "consistency", "experience"] as const;

/** Player database management for an event (eventId) or the global library (eventId = null). */
export function PlayerAdmin({ eventId, rows: external, onChanged, currency = "Cr" }: { eventId: string | null; rows?: PlayerRow[]; onChanged?: () => Promise<void>; currency?: string }) {
  const sb = supabaseBrowser();
  const [own, setOwn] = useState<PlayerRow[]>([]);
  const loadOwn = useCallback(async () => {
    if (external) return;
    const { data } = await sb.from("players").select("*, player_ratings(*)").is("event_id", null).order("name");
    setOwn((data ?? []) as PlayerRow[]);
  }, [sb, external]);
  useEffect(() => void loadOwn(), [loadOwn]);
  const rows = external ?? own;
  const refresh = async () => (onChanged ? onChanged() : loadOwn());

  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<PlayerRow | "new" | null>(null);
  const [preview, setPreview] = useState<{ players: ImportedPlayer[]; errors: string[]; warnings: string[] } | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [lib, setLib] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [quick, setQuick] = useState({ name: "", category: "BAT" as Category, origin: "indian", base_price: "", overall: "" });

  const insertPlayers = async (list: ImportedPlayer[]) => {
    // Inserted in chunks so a large sheet never hits request limits; ratings are matched back by name.
    let done = 0;
    for (let i = 0; i < list.length; i += 150) {
      const chunk = list.slice(i, i + 150);
      if (list.length > 150) setImporting(`${done}/${list.length}`);
      const payload = chunk.map((p) => ({
        event_id: eventId, name: p.name, nationality: p.nationality, origin: p.origin, category: p.category, secondary_category: p.secondary_category,
        batting_style: p.batting_style, bowling_style: p.bowling_style, base_price: p.base_price, photo_url: p.photo_url, lot_number: p.lot_number,
        special_abilities: p.special_abilities, auction_status: "upcoming",
      }));
      const { data, error } = await sb.from("players").insert(payload).select("id, name");
      if (error) {
        setImporting(null);
        await refresh();
        toast.error(
          /duplicate key|players_event_name_key/i.test(error.message)
            ? "Some names already exist in this event (names are matched ignoring capitals and spaces). Remove them from the sheet and try again."
            : /row-level security|permission/i.test(error.message)
              ? "You don't have permission to add players to this event."
              : `Import stopped after ${done} player(s): ${error.message}`,
        );
        return false;
      }
      const byName = new Map(chunk.map((p) => [p.name.toLowerCase(), p]));
      const ratings = (data ?? [])
        .map((r) => ({ player_id: r.id, ...(byName.get(String(r.name).toLowerCase())?.ratings ?? {}), source: eventId ? "event organiser" : "platform library" }))
        .filter((r) => RATING_KEYS.some((k) => (r as Record<string, unknown>)[k] !== null && (r as Record<string, unknown>)[k] !== undefined));
      if (ratings.length) {
        const { error: e2 } = await sb.from("player_ratings").insert(ratings);
        if (e2) toast.error(`Players imported, but ratings failed: ${e2.message}`);
      }
      done += chunk.length;
    }
    setImporting(null);
    await refresh();
    return true;
  };

  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quick.name.trim()) return;
    const ok = await insertPlayers([{
      name: quick.name.trim(), nationality: quick.origin === "indian" ? "India" : null, origin: quick.origin as "indian" | "overseas", category: quick.category, secondary_category: null,
      batting_style: null, bowling_style: null, base_price: Number(quick.base_price || 0), photo_url: null, lot_number: rows.length + 1, special_abilities: [],
      ratings: { overall: quick.overall ? Number(quick.overall) : null, batting: null, bowling: null, fielding: null, wicketkeeping: null, consistency: null, experience: null },
    }]);
    if (ok) {
      toast.success(`${quick.name} added`);
      setQuick({ ...quick, name: "", overall: "" });
      nameRef.current?.focus();
    }
  };

  const onFile = async (file: File) => {
    if (fileRef.current) fileRef.current.value = "";
    let sheet: unknown[][];
    try {
      if (/\.xls$/i.test(file.name)) {
        return toast.error("Old .xls files can't be read. In Excel use File → Save As → Excel Workbook (.xlsx) or CSV, then import that.");
      }
      if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        sheet = (await readSheet(file)) as unknown[][];
      } else {
        sheet = Papa.parse<unknown[]>(await file.text(), { skipEmptyLines: true }).data;
      }
    } catch (e) {
      return toast.error(`Couldn't read “${file.name}”: ${(e as Error).message}. Make sure it is an .xlsx or .csv file (the first sheet is imported).`);
    }
    const result = parsePlayerSheet(sheet);
    // names already in this event/library are skipped rather than failing the import
    const existing = new Set(rows.map((p) => p.name.trim().replace(/\s+/g, " ").toLowerCase()));
    const fresh = result.players.filter((p) => !existing.has(p.name.toLowerCase()));
    const skipped = result.players.length - fresh.length;
    setPreview({
      players: fresh,
      errors: result.errors,
      warnings: [...(skipped ? [`${skipped} player(s) already exist here and were skipped.`] : []), ...result.warnings, ...(result.headerDetected ? [] : ["No header row detected — the first column was read as player names."])],
    });
  };

  const exportCsv = () =>
    downloadCsv(`players${eventId ? "" : "-library"}.csv`, rows.map((p) => {
      const r = ratingOf(p);
      return { lot_number: p.lot_number, name: p.name, nationality: p.nationality, origin: p.origin, category: p.category, secondary_category: p.secondary_category, batting_style: p.batting_style, bowling_style: p.bowling_style, base_price: p.base_price,
        overall: r?.overall, batting: r?.batting, bowling: r?.bowling, fielding: r?.fielding, wicketkeeping: r?.wicketkeeping, consistency: r?.consistency, experience: r?.experience,
        special_abilities: p.special_abilities, photo_url: p.photo_url, auction_status: p.auction_status, sold_price: p.sold_price };
    }));

  const remove = async (p: PlayerRow) => {
    if (p.auction_status === "sold") return toast.error("Sold players cannot be deleted. Void the sale first.");
    if (!confirm(`Delete ${p.name}?`)) return;
    const { error } = await sb.from("players").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await refresh();
  };

  const filtered = useMemo(() => rows.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const cols: Column<PlayerRow>[] = [
    { key: "lot", header: "Lot", cell: (p) => p.lot_number ?? "", sort: (p) => p.lot_number },
    { key: "name", header: "Name", cell: (p) => <span className="font-medium">{p.name}</span>, sort: (p) => p.name },
    { key: "role", header: "Role", cell: (p) => <CategoryBadge category={p.category} origin={p.origin} />, sort: (p) => p.category },
    { key: "nat", header: "Nationality", cell: (p) => p.nationality ?? "—", sort: (p) => p.nationality },
    { key: "base", header: "Base", align: "right", cell: (p) => p.base_price, sort: (p) => Number(p.base_price) },
    { key: "ovr", header: "Rating", align: "right", cell: (p) => (ratingOf(p)?.overall == null ? <Badge tone="warn">unrated</Badge> : <b>{fmtRating(Number(ratingOf(p)!.overall))}</b>), sort: (p) => ratingOf(p)?.overall ?? null },
    ...(eventId ? [{ key: "st", header: "Status", cell: (p: PlayerRow) => <AuctionStatusBadge status={p.auction_status} />, sort: (p: PlayerRow) => p.auction_status }] : []),
    { key: "act", header: "", align: "right", cell: (p) => (
      <span className="flex justify-end gap-2 text-faint">
        <button onClick={() => setEdit(p)} className="hover:text-fg cursor-pointer" aria-label="Edit"><Pencil size={13} /></button>
        <button onClick={() => remove(p)} className="hover:text-danger cursor-pointer" aria-label="Delete"><Trash2 size={13} /></button>
      </span>
    ) },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title={eventId ? "Players" : "Global player library"}
        description={eventId ? `${rows.length} players in this event. Ratings must come from the organiser or a trusted source.` : "Reusable players and ratings that auctioneers can import into events."}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <Button variant="outline" size="sm" onClick={() => downloadCsv("player-template.csv", [Object.fromEntries(PLAYER_TEMPLATE_HEADERS.map((h) => [h, ""]))])}>Template</Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import CSV / Excel</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download size={14} /> Export</Button>
            {eventId && <Button variant="outline" size="sm" onClick={() => setLib(true)}><Library size={14} /> From library</Button>}
            <Button size="sm" onClick={() => setEdit("new")}>Full form</Button>
          </>
        }
      />
      <Card>
        <CardHeader title="Quick add" description="Name → role → origin → base → rating → Enter. Under 10 seconds per player." />
        <CardBody>
          <form onSubmit={quickAdd} className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
            <Input ref={nameRef} placeholder="Player name" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} autoFocus />
            <Select value={quick.category} onChange={(e) => setQuick({ ...quick, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select>
            <Select value={quick.origin} onChange={(e) => setQuick({ ...quick, origin: e.target.value })}><option value="indian">Indian</option><option value="overseas">Overseas</option></Select>
            <Input type="number" step="0.05" min="0" placeholder={`Base (${currency})`} value={quick.base_price} onChange={(e) => setQuick({ ...quick, base_price: e.target.value })} />
            <Input type="number" step="0.01" min="0" placeholder="Rating" value={quick.overall} onChange={(e) => setQuick({ ...quick, overall: e.target.value })} />
            <Button>Add</Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <div className="p-3"><Input className="max-w-xs" placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <DataTable rows={filtered} columns={cols} rowKey={(p) => p.id} initialSort={{ key: "lot", dir: "asc" }} dense />
      </Card>
      {edit && <PlayerEditDialog player={edit === "new" ? null : edit} eventId={eventId} onClose={() => setEdit(null)} onSaved={refresh} />}
      {preview && (
        <Dialog open onClose={() => setPreview(null)} title="Import preview" wide>
          <p className="text-sm">{preview.players.length} player(s) ready to import{preview.errors.length ? `, ${preview.errors.length} row(s) with problems` : ""}. Only the name is required — anything else in the sheet is imported as given.</p>
          {preview.warnings.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-muted">{preview.warnings.map((e) => <li key={e}>• {e}</li>)}</ul>}
          {preview.errors.length > 0 && <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-danger">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="mt-3 max-h-72 overflow-y-auto text-xs">
            <table className="w-full tabular"><tbody>{preview.players.slice(0, 200).map((p, i) => <tr key={i} className="border-t border-line/40"><td className="py-1">{p.name}</td><td className="text-muted">{p.origin ?? "—"}</td><td className="text-muted">{p.category ?? "—"}</td><td className="text-right">{p.base_price || ""}</td><td className="text-right">{p.ratings.overall ?? <span className="text-warn">unrated</span>}</td></tr>)}</tbody></table>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button><Button disabled={!preview.players.length || importing !== null} onClick={async () => { if (await insertPlayers(preview.players)) { toast.success(`${preview.players.length} players imported`); setPreview(null); } }}>{importing ? `Importing ${importing}…` : `Import ${preview.players.length}`}</Button></div>
        </Dialog>
      )}
      {lib && eventId && <LibraryDialog eventId={eventId} onClose={() => setLib(false)} onDone={refresh} />}
    </div>
  );
}

function PlayerEditDialog({ player, eventId, onClose, onSaved }: { player: PlayerRow | null; eventId: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const sb = supabaseBrowser();
  const r = player ? ratingOf(player) : null;
  const [f, setF] = useState({
    name: player?.name ?? "", nationality: player?.nationality ?? "", origin: player?.origin ?? "indian", category: player?.category ?? "BAT",
    secondary_category: player?.secondary_category ?? "", batting_style: player?.batting_style ?? "", bowling_style: player?.bowling_style ?? "",
    base_price: String(player?.base_price ?? ""), photo_url: player?.photo_url ?? "", lot_number: String(player?.lot_number ?? ""),
    special_abilities: (player?.special_abilities ?? []).join(", "), availability: player?.availability ?? true,
    withdrawn: player?.auction_status === "withdrawn", rating_source: r?.source ?? (eventId ? "event organiser" : "platform library"),
    ...Object.fromEntries(RATING_KEYS.map((k) => [k, r?.[k] == null ? "" : String(r[k])])),
  } as Record<string, string | boolean>);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const n = (k: string) => (f[k] === "" ? null : Number(f[k]));
    const body = {
      name: String(f.name).trim(), nationality: f.nationality || null, origin: f.origin, category: f.category, secondary_category: f.secondary_category || null,
      batting_style: f.batting_style || null, bowling_style: f.bowling_style || null, base_price: Number(f.base_price || 0), photo_url: f.photo_url || null,
      lot_number: n("lot_number"), special_abilities: String(f.special_abilities).split(",").map((s) => s.trim()).filter(Boolean), availability: Boolean(f.availability),
      ...(player && player.auction_status !== "sold" ? { auction_status: f.withdrawn ? "withdrawn" : player.auction_status === "withdrawn" ? "upcoming" : player.auction_status } : {}),
    };
    if (!body.name) return toast.error("Name is required");
    const res = player ? await sb.from("players").update(body).eq("id", player.id).select("id").single() : await sb.from("players").insert({ ...body, event_id: eventId }).select("id").single();
    if (res.error) return toast.error(res.error.message);
    const ratings = { player_id: res.data.id, source: String(f.rating_source || "admin"), ...Object.fromEntries(RATING_KEYS.map((k) => [k, n(k)])) };
    const { error } = await sb.from("player_ratings").upsert(ratings);
    if (error) return toast.error(error.message);
    toast.success("Player saved");
    await onSaved();
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={player ? `Edit ${player.name}` : "New player"} wide>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="Name" className="col-span-2"><Input value={String(f.name)} onChange={set("name")} /></Field>
        <Field label="Nationality"><Input value={String(f.nationality)} onChange={set("nationality")} /></Field>
        <Field label="Lot number"><Input type="number" value={String(f.lot_number)} onChange={set("lot_number")} /></Field>
        <Field label="Origin"><Select value={String(f.origin)} onChange={set("origin")}><option value="indian">Indian</option><option value="overseas">Overseas</option></Select></Field>
        <Field label="Primary category"><Select value={String(f.category)} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field>
        <Field label="Secondary category"><Select value={String(f.secondary_category)} onChange={set("secondary_category")}><option value="">None</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field>
        <Field label="Base price"><Input type="number" step="0.05" value={String(f.base_price)} onChange={set("base_price")} /></Field>
        <Field label="Batting style"><Input value={String(f.batting_style)} onChange={set("batting_style")} placeholder="Right-hand bat" /></Field>
        <Field label="Bowling style"><Input value={String(f.bowling_style)} onChange={set("bowling_style")} placeholder="Right-arm fast" /></Field>
        <Field label="Photo URL" className="col-span-2"><Input value={String(f.photo_url)} onChange={set("photo_url")} /></Field>
        <Field label="Special abilities (comma separated)" className="col-span-2 md:col-span-4"><Input value={String(f.special_abilities)} onChange={set("special_abilities")} /></Field>
        {RATING_KEYS.map((k) => <Field key={k} label={k}><Input type="number" step="0.01" min="0" value={String(f[k])} onChange={set(k)} /></Field>)}
        <Field label="Rating source"><Input value={String(f.rating_source)} onChange={set("rating_source")} /></Field>
        {player && player.auction_status !== "sold" && eventId && (
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(f.withdrawn)} onChange={(e) => setF({ ...f, withdrawn: e.target.checked })} /> Withdrawn (not available for auction)</label>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save player</Button></div>
    </Dialog>
  );
}

function LibraryDialog({ eventId, onClose, onDone }: { eventId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  useEffect(() => {
    void sb.from("players").select("*, player_ratings(*)").is("event_id", null).order("name").then(({ data }) => setRows((data ?? []) as PlayerRow[]));
  }, [sb]);
  const list = rows.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const go = async () => {
    const n = await rpc<number>("import_library_players", { p_event: eventId, p_ids: [...sel] });
    if (n !== null) {
      toast.success(`${n} players imported (duplicates skipped)`);
      await onDone();
      onClose();
    }
  };
  return (
    <Dialog open onClose={onClose} title="Import from global library" wide>
      <Input placeholder="Search library…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 flex gap-2 text-xs"><button className="text-accent cursor-pointer" onClick={() => setSel(new Set(list.map((p) => p.id)))}>Select all shown</button><button className="text-muted cursor-pointer" onClick={() => setSel(new Set())}>Clear</button><span className="ml-auto text-faint">{sel.size} selected</span></div>
      <ul className="mt-2 max-h-80 divide-y divide-line/40 overflow-y-auto">
        {list.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-2 py-1.5 text-sm">
              <input type="checkbox" checked={sel.has(p.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(p.id); else s.delete(p.id); setSel(s); }} />
              <span className="flex-1">{p.name}</span><CategoryBadge category={p.category} origin={p.origin} /><span className="w-12 text-right tabular">{fmtRating(ratingOf(p)?.overall ?? null)}</span>
            </label>
          </li>
        ))}
        {!list.length && <li className="py-6 text-center text-xs text-muted">The library is empty.</li>}
      </ul>
      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!sel.size} onClick={go}>Import {sel.size}</Button></div>
    </Dialog>
  );
}
