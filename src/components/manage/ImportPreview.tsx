"use client";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CATEGORY_LABEL } from "@/lib/engine";
import { applyPlan, guessPlan, IMPORT_FIELDS, type ImportField, type ImportedPlayer, type SheetPlan } from "@/lib/data/importPlayers";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Badge, Dialog } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * Import preview with column matching: every column of the uploaded sheet (Excel, CSV, PDF, Word…)
 * is matched to a player field automatically; the organiser can change any match before importing.
 */
export function ImportPreview({
  sheets,
  source,
  notes,
  existingNames,
  ratingScale,
  importing,
  onClose,
  onImport,
  onSetScale,
}: {
  sheets: { name: string; rows: unknown[][] }[];
  source: string;
  notes: string[];
  existingNames: Set<string>;
  ratingScale?: number;
  importing: string | null;
  onClose: () => void;
  onImport: (players: ImportedPlayer[]) => void;
  onSetScale?: (scale: number) => Promise<void>;
}) {
  const [sheetIdx, setSheetIdx] = useState(0);
  const rows = sheets[sheetIdx].rows;
  const [plan, setPlan] = useState<SheetPlan>(() => guessPlan(rows));
  const [scaleSet, setScaleSet] = useState(false);
  const result = useMemo(() => applyPlan(rows, plan), [rows, plan]);
  const fresh = result.players.filter((p) => !existingNames.has(p.name.toLowerCase()));
  const skipped = result.players.length - fresh.length;
  const setField = (index: number, field: ImportField) =>
    setPlan({
      ...plan,
      // one column per field: a previous column with this field becomes "extra"
      columns: plan.columns.map((c) => (c.index === index ? { ...c, field, why: "chosen by you" } : field !== "extra" && field !== "ignore" && c.field === field ? { ...c, field: "extra", why: "replaced by your choice" } : c)),
    });
  const overScale = ratingScale !== undefined && result.maxRating !== null && result.maxRating > ratingScale && !scaleSet;
  const extraCols = plan.columns.filter((c) => c.field === "extra");
  return (
    <Dialog open onClose={onClose} title="Import preview" wide>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Read from: {sheets.length > 1 ? "Excel workbook" : source}</span>
        {sheets.length > 1 && (
          <Select className="h-7 w-48 text-xs" value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); setPlan(guessPlan(sheets[i].rows)); }}>
            {sheets.map((s, i) => <option key={s.name} value={i}>Sheet: {s.name}</option>)}
          </Select>
        )}
        <span>· header row: {plan.headerRow === null ? "none detected" : `row ${plan.headerRow + 1}`}</span>
      </div>
      {notes.map((n) => <p key={n} className="mt-1 text-xs text-warn">{n}</p>)}

      <div className="mt-3">
        <div className="mb-1 text-xs font-semibold">Column matching <span className="font-normal text-faint">— change any column if it was guessed wrong</span></div>
        <div className="max-h-56 overflow-auto rounded-md border border-line/60">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface text-left text-[10px] uppercase text-faint"><tr><th className="px-2 py-1">Column in file</th><th>Sample values</th><th className="w-48">Import as</th></tr></thead>
            <tbody>
              {plan.columns.map((c) => (
                <tr key={c.index} className={cn("border-t border-line/40", c.field === "ignore" && "opacity-50")}>
                  <td className="px-2 py-1"><div className="font-medium">{c.header}</div><div className="text-[10px] text-faint">{c.why}</div></td>
                  <td className="max-w-56 truncate text-muted">{c.samples.join(" · ")}</td>
                  <td className="py-1 pr-2">
                    <Select className="h-7 text-xs" value={c.field} onChange={(e) => setField(c.index, e.target.value as ImportField)}>
                      {IMPORT_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {overScale && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
          <AlertTriangle size={14} /> Ratings in this file go up to <b>{result.maxRating}</b>, but this event&apos;s rating scale is {ratingScale}. Live entry would reject ratings above {ratingScale}.
          {onSetScale && (
            <Button size="sm" variant="secondary" onClick={async () => { await onSetScale(Math.ceil(result.maxRating as number)); setScaleSet(true); }}>
              Set rating scale to {Math.ceil(result.maxRating as number)}
            </Button>
          )}
        </div>
      )}

      <p className="mt-3 text-sm">
        <b>{fresh.length}</b> player(s) ready to import{result.errors.length ? `, ${result.errors.length} row(s) with problems` : ""}. Only the name is required.
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted">
        {skipped > 0 && <li>• {skipped} player(s) already exist here and were skipped.</li>}
        {result.warnings.map((w) => <li key={w}>• {w}</li>)}
      </ul>
      {result.errors.length > 0 && <ul className="mt-1 max-h-24 overflow-y-auto text-xs text-danger">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>}

      <div className="mt-2 max-h-64 overflow-auto rounded-md border border-line/60">
        <table className="w-full text-xs tabular">
          <thead className="sticky top-0 bg-surface text-left text-[10px] uppercase text-faint">
            <tr><th className="px-2 py-1">No.</th><th>Player</th><th>Role</th><th>IN/OS</th><th className="text-right">Rating</th><th className="text-right">Base</th>{extraCols.length > 0 && <th className="pl-3">Extra</th>}</tr>
          </thead>
          <tbody>
            {fresh.slice(0, 300).map((p, i) => (
              <tr key={i} className="border-t border-line/40">
                <td className="px-2 py-1 text-faint">{p.lot_number ?? ""}</td>
                <td className="font-medium">{p.name}</td>
                <td className="text-muted">{p.category ? CATEGORY_LABEL[p.category] : "—"}</td>
                <td className="text-muted">{p.origin === "overseas" ? "Overseas" : p.origin === "indian" ? "Indian" : "—"}</td>
                <td className="text-right">{p.ratings.overall ?? <span className="text-faint">—</span>}</td>
                <td className="text-right">{p.base_price || ""}</td>
                {extraCols.length > 0 && <td className="pl-3 text-muted">{Object.entries(p.attributes ?? {}).map(([k, v]) => <Badge key={k}>{k}: {v}</Badge>)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!fresh.length || importing !== null} onClick={() => onImport(fresh)}>{importing ? `Importing ${importing}…` : `Import ${fresh.length}`}</Button>
      </div>
    </Dialog>
  );
}
