"use client";
import Papa from "papaparse";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/engine";
import { matchResultRows, type ResultRow } from "@/lib/data/importResults";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEventData } from "@/hooks/useEventData";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Badge, Dialog } from "@/components/ui/misc";
import { downloadCsv } from "@/lib/utils";

async function createPlayer(eventId: string, name: string, category: Category, origin: string, overall: number | null, base = 0) {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("players").insert({ event_id: eventId, name, category, origin, base_price: base, nationality: origin === "indian" ? "India" : null }).select("id").single();
  if (error) throw error;
  if (overall !== null) await sb.from("player_ratings").insert({ player_id: data.id, overall, source: "entered by data entry" });
  return data.id as string;
}

/** Inline “player not found → add it now” for fast data entry. */
export function QuickAddPlayer({ name, onAdded }: { name: string; onAdded: (id: string) => Promise<void> }) {
  const { event } = useEventData();
  const [category, setCategory] = useState<Category>("BAT");
  const [origin, setOrigin] = useState("indian");
  const [rating, setRating] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const id = await createPlayer(event!.id, name, category, origin, rating ? Number(rating) : null);
      toast.success(`${name} added`);
      await onAdded(id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-md border border-dashed border-line p-2 text-xs">
      <div className="mb-1.5">“{name}” isn&apos;t in the list — add it:</div>
      <div className="grid grid-cols-3 gap-1.5">
        <Select className="h-8 text-xs" value={category} onChange={(e) => setCategory(e.target.value as Category)}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select>
        <Select className="h-8 text-xs" value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="indian">Indian</option><option value="overseas">Overseas</option></Select>
        <Input className="h-8 text-xs" type="number" step="0.01" placeholder="Rating" value={rating} onChange={(e) => setRating(e.target.value)} />
      </div>
      <Button size="sm" className="mt-1.5 w-full" onClick={add} disabled={busy}>Add &amp; put on the block</Button>
    </div>
  );
}

/** Import a whole results sheet (player, team, price) from Excel or CSV. */
export function ResultsImport({ onClose }: { onClose: () => void }) {
  const { event, players, teams, reload } = useEventData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const onFile = async (file: File) => {
    let records: Record<string, unknown>[];
    if (/\.xls$/i.test(file.name)) {
      toast.error("Old .xls files can't be read. Save the sheet as .xlsx or CSV and import that.");
      return;
    }
    if (/\.xlsx?$/i.test(file.name)) {
      const { readSheet } = await import("read-excel-file/browser");
      const sheet = (await readSheet(file)) as unknown[][];
      const [head, ...body] = sheet;
      records = body.map((r) => Object.fromEntries((head ?? []).map((h, i) => [String(h ?? ""), r[i]])));
    } else records = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: true }).data;
    setRows(matchResultRows(records, players, teams));
  };
  const ok = rows?.filter((r) => !r.problem) ?? [];
  const apply = async () => {
    const sb = supabaseBrowser();
    let done = 0;
    const failed: string[] = [];
    for (const r of ok) {
      setProgress(`${done}/${ok.length}`);
      try {
        const pid = r.playerId ?? (await createPlayer(event!.id, r.playerName, r.newPlayer!.category, r.newPlayer!.origin, r.newPlayer!.overall));
        const res = r.price === null
          ? await sb.rpc("mark_unsold", { p_event: event!.id, p_player: pid, p_note: "imported" })
          : await sb.rpc("record_sale", { p_event: event!.id, p_player: pid, p_team: r.teamId, p_amount: r.price, p_note: "imported" });
        if (res.error) failed.push(`Row ${r.line} ${r.playerName}: ${res.error.message}`);
        else done++;
      } catch (e) {
        failed.push(`Row ${r.line} ${r.playerName}: ${(e as Error).message}`);
      }
    }
    setProgress(null);
    await reload();
    if (failed.length) toast.warning(`${done} imported, ${failed.length} failed`, { description: failed.slice(0, 5).join("\n") });
    else toast.success(`${done} results imported`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Import auction results" wide>
      <p className="text-sm text-muted">Upload the Excel or CSV sheet you keep during the auction. Columns: <b>player</b>, <b>team</b>, <b>price</b> (write <i>unsold</i> in team or price for unsold). Optional <b>role</b>, <b>origin</b>, <b>rating</b> create players that aren&apos;t in the list yet.</p>
      <div className="mt-3 flex gap-2">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Button onClick={() => fileRef.current?.click()}>Choose file</Button>
        <Button variant="outline" onClick={() => downloadCsv("results-template.csv", [{ player: "Player name", team: teams[0]?.name ?? "Team", price: 2.5, role: "BAT", origin: "Indian", rating: "" }])}>Template</Button>
      </div>
      {rows && (
        <>
          <div className="mt-3 text-sm">{ok.length} ready · {rows.length - ok.length} need attention</div>
          <div className="mt-2 max-h-80 overflow-y-auto">
            <table className="w-full text-xs tabular">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t border-line/40">
                    <td className="py-1 text-faint">{r.line}</td>
                    <td>{r.playerName} {r.newPlayer && <Badge tone="info">new</Badge>}</td>
                    <td>{r.price === null ? <Badge tone="warn">unsold</Badge> : r.teamName}</td>
                    <td className="text-right">{r.price ?? ""}</td>
                    <td className="pl-3">{r.problem ? <span className="text-danger">{r.problem}</span> : <span className="text-ok">ok</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={!ok.length || progress !== null} onClick={apply}>{progress ? `Importing ${progress}…` : `Record ${ok.length} results`}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
