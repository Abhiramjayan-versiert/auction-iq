"use client";
import { ArrowDown, ArrowUp, Copy, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CATEGORIES, CATEGORY_LABEL, fmtRating, type Player } from "@/lib/engine";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { TransactionRow } from "@/lib/types/db";
import { Badge } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { cn, fmtTime } from "@/lib/utils";
import { TeamCombobox } from "./TeamCombobox";

type Col = "name" | "rating" | "category" | "origin" | "nationality" | "base" | "team" | "price" | "status";
const COLS: { key: Col | "no" | "time" | "actions"; label: string; editable: boolean; w?: string; align?: "right" }[] = [
  { key: "no", label: "No.", editable: false, w: "w-12" },
  { key: "name", label: "Player name", editable: true, w: "min-w-48" },
  { key: "rating", label: "Rating", editable: true, w: "w-20", align: "right" },
  { key: "category", label: "Category", editable: true, w: "w-32" },
  { key: "origin", label: "IN/OS", editable: true, w: "w-24" },
  { key: "nationality", label: "Nationality", editable: true, w: "w-32" },
  { key: "base", label: "Base price", editable: true, w: "w-24", align: "right" },
  { key: "team", label: "Winning team", editable: true, w: "min-w-44" },
  { key: "price", label: "Sold price", editable: true, w: "w-24", align: "right" },
  { key: "status", label: "Status", editable: true, w: "w-24" },
  { key: "time", label: "Time", editable: false, w: "w-20" },
  { key: "actions", label: "", editable: false, w: "w-20" },
];

export interface GridRow {
  no: number;
  tx: TransactionRow;
  player: Player;
}

export function EntryGrid({
  rows,
  teams,
  teamName,
  currency,
  scale,
  onChanged,
  latestActiveId,
}: {
  rows: GridRow[];
  teams: { id: string; name: string; short_name?: string | null }[];
  teamName: (id: string | null | undefined) => string;
  currency: string;
  scale: number;
  onChanged: () => Promise<void> | void;
  latestActiveId: string | null;
}) {
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "sold" | "unsold" | "reversed">("");
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "no", dir: -1 });
  const [edit, setEdit] = useState<{ id: string; col: Col; value: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const view = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (k && !`${r.player.name} ${r.player.nationality ?? ""} ${teamName(r.tx.team_id)}`.toLowerCase().includes(k)) return false;
      if (teamFilter && r.tx.team_id !== teamFilter) return false;
      if (statusFilter === "reversed") return r.tx.status === "voided";
      if (statusFilter && (r.tx.status !== "active" || (statusFilter === "sold") !== (r.tx.type === "sale"))) return false;
      if (!statusFilter && r.tx.status !== "active") return false;
      return true;
    });
    const val = (r: GridRow): string | number => {
      switch (sort.col) {
        case "name": return r.player.name.toLowerCase();
        case "rating": return r.player.overall ?? -1;
        case "team": return teamName(r.tx.team_id);
        case "price": return Number(r.tx.amount ?? -1);
        case "base": return Number(r.player.base_price ?? 0);
        case "category": return r.player.category ?? "~";
        case "nationality": return (r.player.nationality ?? "~").toLowerCase();
        case "status": return r.tx.type;
        default: return r.no;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, teamFilter, statusFilter, sort, teamName]);

  const cellText = (r: GridRow, col: Col | "no" | "time" | "actions"): string => {
    switch (col) {
      case "no": return String(r.no);
      case "name": return r.player.name;
      case "rating": return r.player.overall === null ? "" : String(r.player.overall);
      case "category": return r.player.category ? CATEGORY_LABEL[r.player.category] : "";
      case "origin": return r.player.origin === "overseas" ? "Overseas" : r.player.origin === "indian" ? "Indian" : "";
      case "nationality": return r.player.nationality ?? "";
      case "base": return Number(r.player.base_price) ? String(r.player.base_price) : "";
      case "team": return r.tx.type === "sale" ? teamName(r.tx.team_id) : "";
      case "price": return r.tx.type === "sale" ? String(r.tx.amount ?? "") : "";
      case "status": return r.tx.status === "voided" ? "Reversed" : r.tx.type === "sale" ? "Sold" : "Unsold";
      case "time": return fmtTime(r.tx.created_at);
      default: return "";
    }
  };

  const startEdit = (r: GridRow, col: Col, initial?: string) => {
    if (r.tx.status !== "active") return;
    const v =
      initial ??
      (col === "category" ? r.player.category ?? "" : col === "origin" ? r.player.origin ?? "" : col === "team" ? r.tx.team_id ?? "" : col === "status" ? (r.tx.type === "sale" ? "sold" : "unsold") : cellText(r, col));
    setEdit({ id: r.tx.id, col, value: v });
  };

  const commit = async (r: GridRow, col: Col, value: string) => {
    setEdit(null);
    const before = col === "category" ? r.player.category ?? "" : col === "origin" ? r.player.origin ?? "" : col === "team" ? r.tx.team_id ?? "" : col === "status" ? (r.tx.type === "sale" ? "sold" : "unsold") : cellText(r, col);
    if (String(value).trim() === String(before).trim()) return;
    const args: Record<string, unknown> = { p_tx: r.tx.id, p_reason: `grid edit: ${col}` };
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    if (col === "name") {
      if (!value.trim()) return toast.error("Player name cannot be empty");
      args.p_name = value;
    } else if (col === "rating") {
      const n = num(value);
      if (n === null) args.p_clear_rating = true;
      else if (!Number.isFinite(n) || n < 0 || n > scale) return toast.error(`Rating must be 0–${scale}`);
      else args.p_rating = n;
    } else if (col === "category") args.p_category = value;
    else if (col === "origin") args.p_origin = value;
    else if (col === "nationality") args.p_nationality = value.trim();
    else if (col === "base") {
      const n = num(value);
      if (n === null || !Number.isFinite(n) || n < 0) return toast.error("Base price must be a positive number");
      args.p_base_price = n;
    } else if (col === "price") {
      const n = num(value);
      if (n === null || !Number.isFinite(n) || n < 0) return toast.error("Enter a valid price");
      args.p_amount = n;
      if (r.tx.type !== "sale") {
        if (!r.tx.team_id) return toast.error("Set the winning team first");
      }
    } else if (col === "team") {
      if (!value) return;
      args.p_team = value;
      if (r.tx.type !== "sale") {
        const p = prompt(`Sold price for ${r.player.name}?`);
        if (p === null) return;
        const n = Number(p);
        if (!Number.isFinite(n) || n < 0) return toast.error("Enter a valid price");
        args.p_amount = n;
        args.p_status = "sold";
      }
    } else if (col === "status") {
      if (value === "sold" && r.tx.type !== "sale") {
        toast.info("Pick the winning team in the Team column to turn this into a sale");
        return;
      }
      if (value === "unsold" && !confirm(`Mark ${r.player.name} unsold? The sale will be reversed and the purse refunded.`)) return;
      args.p_status = value;
    }
    setSaving(r.tx.id);
    const { error } = await supabaseBrowser().rpc("update_live_entry", args);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Updated — all calculations refreshed", { duration: 1200 });
    await onChanged();
  };

  const reverse = async (r: GridRow) => {
    if (!confirm(`Reverse the ${r.tx.type === "sale" ? `sale of ${r.player.name} to ${teamName(r.tx.team_id)}` : `unsold entry for ${r.player.name}`}? It stays in history as reversed.`)) return;
    const reason = prompt("Reason (saved in the audit log)", "entered in error") ?? "entered in error";
    const { error } = await supabaseBrowser().rpc("void_transaction", { p_tx: r.tx.id, p_reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Entry reversed");
    await onChanged();
  };

  const focusCell = (ri: number, ci: number) => {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`);
    el?.focus();
  };

  const onCellKey = (e: React.KeyboardEvent, ri: number, ci: number, r: GridRow) => {
    const col = COLS[ci].key;
    if (e.key === "ArrowDown") return e.preventDefault(), focusCell(Math.min(ri + 1, view.length - 1), ci);
    if (e.key === "ArrowUp") return e.preventDefault(), focusCell(Math.max(ri - 1, 0), ci);
    if (e.key === "ArrowRight") return e.preventDefault(), focusCell(ri, Math.min(ci + 1, COLS.length - 1));
    if (e.key === "ArrowLeft") return e.preventDefault(), focusCell(ri, Math.max(ci - 1, 0));
    if (!COLS[ci].editable) return;
    if (e.key === "Enter" || e.key === "F2") return e.preventDefault(), startEdit(r, col as Col);
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && ["name", "rating", "nationality", "base", "price"].includes(col)) {
      e.preventDefault();
      startEdit(r, col as Col, e.key);
    }
  };

  const copyVisible = async () => {
    const head = COLS.filter((c) => c.key !== "actions").map((c) => c.label).join("\t");
    const body = view.map((r) => COLS.filter((c) => c.key !== "actions").map((c) => cellText(r, c.key)).join("\t")).join("\n");
    await navigator.clipboard.writeText(`${head}\n${body}`);
    toast.success(`${view.length} rows copied — paste into Excel or Google Sheets`);
  };

  const editor = (r: GridRow, col: Col) => {
    if (!edit) return null;
    const done = (v: string) => void commit(r, col, v);
    const common = { autoFocus: true, className: "h-8 w-full text-sm" };
    const keys = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setEdit(null);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        done((e.target as HTMLInputElement).value);
      }
    };
    if (col === "category")
      return (
        <Select {...common} value={edit.value} onChange={(e) => done(e.target.value)} onBlur={() => setEdit(null)} onKeyDown={keys}>
          <option value="">Not recorded</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
      );
    if (col === "origin")
      return (
        <Select {...common} value={edit.value} onChange={(e) => done(e.target.value)} onBlur={() => setEdit(null)} onKeyDown={keys}>
          <option value="">Not recorded</option>
          <option value="indian">Indian</option>
          <option value="overseas">Overseas</option>
        </Select>
      );
    if (col === "status")
      return (
        <Select {...common} value={edit.value} onChange={(e) => done(e.target.value)} onBlur={() => setEdit(null)} onKeyDown={keys}>
          <option value="sold">Sold</option>
          <option value="unsold">Unsold</option>
        </Select>
      );
    if (col === "team") return <TeamCombobox teams={teams} value={edit.value} onChange={(id) => id && done(id)} onEnter={() => setEdit(null)} className="h-8" />;
    return (
      <Input
        {...common}
        type={col === "name" || col === "nationality" ? "text" : "number"}
        step="any"
        defaultValue={edit.value}
        onBlur={(e) => done(e.target.value)}
        onKeyDown={keys}
        onFocus={(e) => {
          const el = e.target;
          if (el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
        }}
      />
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line/60 p-2">
        <Input className="h-8 w-56" placeholder="Search player, team, nationality…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="h-8 w-44 text-xs" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select className="h-8 w-40 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="">Active entries</option>
          <option value="sold">Sold only</option>
          <option value="unsold">Unsold only</option>
          <option value="reversed">Reversed (history)</option>
        </Select>
        <span className="text-xs text-faint">{view.length} rows · click a cell or press Enter to edit · arrows to move</span>
        <button onClick={copyVisible} className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer"><Copy size={12} /> Copy rows</button>
      </div>
      <div className="max-h-[56vh] overflow-auto">
        <table ref={tableRef} className="w-full border-collapse text-sm tabular">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={cn("border-b border-line px-2 py-2 font-medium whitespace-nowrap select-none", c.w, c.align === "right" && "text-right", c.key !== "actions" && "cursor-pointer hover:text-fg")}
                  onClick={() => c.key !== "actions" && setSort((s) => ({ col: c.key, dir: s.col === c.key ? (-s.dir as 1 | -1) : c.key === "no" ? -1 : 1 }))}
                >
                  <span className="inline-flex items-center gap-1">{c.label}{sort.col === c.key && (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, ri) => (
              <tr key={r.tx.id} className={cn("border-b border-line/40", r.tx.status === "voided" && "opacity-50 line-through", saving === r.tx.id && "animate-pulse", r.tx.id === latestActiveId && "bg-accent/5")}>
                {COLS.map((c, ci) => {
                  const editing = edit?.id === r.tx.id && edit.col === c.key;
                  if (c.key === "actions")
                    return (
                      <td key={c.key} className="px-2 py-1 text-right">
                        {r.tx.status === "active" && (
                          <button onClick={() => reverse(r)} className="inline-flex items-center gap-1 text-xs text-faint hover:text-danger cursor-pointer" title="Reverse this entry (kept in history)">
                            <RotateCcw size={12} /> Reverse
                          </button>
                        )}
                      </td>
                    );
                  const text = cellText(r, c.key);
                  return (
                    <td
                      key={c.key}
                      data-r={ri}
                      data-c={ci}
                      tabIndex={0}
                      onKeyDown={(e) => !editing && onCellKey(e, ri, ci, r)}
                      onDoubleClick={() => c.editable && startEdit(r, c.key as Col)}
                      onClick={() => c.editable && !editing && ["category", "origin", "status", "team"].includes(c.key) && startEdit(r, c.key as Col)}
                      className={cn(
                        "whitespace-nowrap px-2 py-1 outline-none focus:bg-accent/10 focus:ring-1 focus:ring-inset focus:ring-accent/60",
                        c.align === "right" && "text-right",
                        c.editable && r.tx.status === "active" && "cursor-text",
                      )}
                    >
                      {editing ? (
                        editor(r, c.key as Col)
                      ) : c.key === "status" ? (
                        <Badge tone={r.tx.status === "voided" ? "neutral" : r.tx.type === "sale" ? "ok" : "warn"}>{text}</Badge>
                      ) : c.key === "rating" ? (
                        r.player.overall === null ? <span className="text-faint">—</span> : <b>{fmtRating(r.player.overall)}</b>
                      ) : c.key === "price" && text ? (
                        <span className="font-medium">{text} <span className="text-[10px] text-faint">{currency}</span></span>
                      ) : text ? (
                        <span className={c.key === "name" ? "font-medium" : ""}>{text}</span>
                      ) : (
                        <span className="text-faint">{c.editable ? "·" : ""}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!view.length && (
              <tr>
                <td colSpan={COLS.length} className="py-10 text-center text-sm text-muted">
                  {rows.length ? "No rows match the filters." : "No entries yet — type the first player above and press Enter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
