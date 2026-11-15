"use client";
import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/engine";
import { validateDraft, type EntryDraft, type EntryPayload, type PastedRow, type PlayerLite, type TeamLite } from "@/lib/data/liveEntry";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Review rows pasted from Excel / Google Sheets: invalid rows are highlighted and editable before saving. */
export function BulkPasteDialog({
  rows: initial,
  teams,
  players,
  scale,
  onClose,
  onSubmit,
}: {
  rows: PastedRow[];
  teams: TeamLite[];
  players: PlayerLite[];
  scale: number;
  onClose: () => void;
  onSubmit: (items: { payload: EntryPayload; label: string }[]) => void;
}) {
  const [rows, setRows] = useState(initial);
  const checked = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((r) => {
      const v = validateDraft(r.draft, { scale, players });
      const k = r.draft.name.trim().toLowerCase();
      if (k && seen.has(k)) v.errors.push("Duplicate row in this paste.");
      seen.add(k);
      if (r.draft.status === "sold" && !r.draft.team && r.teamText) v.errors.unshift(`Unknown team "${r.teamText}".`);
      return { ...v, payload: v.errors.length ? null : v.payload };
    });
  }, [rows, scale, players]);
  const valid = checked.filter((c) => c.payload).length;
  const set = (i: number, patch: Partial<EntryDraft>) => setRows(rows.map((r, j) => (j === i ? { ...r, draft: { ...r.draft, ...patch } } : r)));
  return (
    <Dialog open onClose={onClose} title={`Paste from Excel — ${rows.length} row(s)`} wide>
      <p className="text-xs text-muted">Columns are read as <b>Player | Rating | Team | Price</b> (optional: Category | Nationality | Base price), or by header names. Fix highlighted rows, then save — every row goes through the same validation as a normal entry.</p>
      <div className="mt-3 max-h-[55vh] overflow-auto">
        <table className="w-full text-xs tabular">
          <thead className="sticky top-0 bg-surface text-left text-[10px] uppercase text-faint">
            <tr><th className="py-1">#</th><th>Player</th><th>Rating</th><th>Team</th><th>Price</th><th>Category</th><th>Status</th><th>Check</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const c = checked[i];
              return (
                <tr key={i} className={cn("border-t border-line/40 align-top", c.errors.length ? "bg-danger/5" : "")}>
                  <td className="py-1 pr-1 text-faint">{r.line}</td>
                  <td className="pr-1"><Input className="h-7 text-xs" value={r.draft.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                  <td className="w-16 pr-1"><Input className="h-7 text-xs" value={r.draft.rating} onChange={(e) => set(i, { rating: e.target.value })} /></td>
                  <td className="w-40 pr-1">
                    <Select className="h-7 text-xs" value={r.draft.team} onChange={(e) => set(i, { team: e.target.value, status: e.target.value ? "sold" : r.draft.status })} disabled={r.draft.status === "unsold"}>
                      <option value="">{r.teamText ? `? ${r.teamText}` : "—"}</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </td>
                  <td className="w-20 pr-1"><Input className="h-7 text-xs" value={r.draft.price} onChange={(e) => set(i, { price: e.target.value })} disabled={r.draft.status === "unsold"} /></td>
                  <td className="w-28 pr-1">
                    <Select className="h-7 text-xs" value={r.draft.category} onChange={(e) => set(i, { category: e.target.value as EntryDraft["category"] })}>
                      <option value="">—</option>
                      {CATEGORIES.map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}
                    </Select>
                  </td>
                  <td className="w-24 pr-1">
                    <Select className="h-7 text-xs" value={r.draft.status} onChange={(e) => set(i, { status: e.target.value as EntryDraft["status"] })}>
                      <option value="sold">Sold</option>
                      <option value="unsold">Unsold</option>
                    </Select>
                  </td>
                  <td className="min-w-40">
                    {c.errors.length ? <span className="text-danger">{c.errors.join(" ")}</span> : <span className="text-ok">ready</span>}
                    {c.warnings.length > 0 && <div className="text-warn">{c.warnings.join(" ")}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">{valid} ready · {rows.length - valid} need attention</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onSubmit(checked.flatMap((c, i) => (c.payload ? [{ payload: c.payload, label: rows[i].draft.name }] : [])))}>
            Save {valid} row{valid === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
