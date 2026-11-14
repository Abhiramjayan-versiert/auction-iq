"use client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sort?: (row: T) => number | string | null;
  className?: string;
  align?: "right" | "left";
}

/** Compact sortable data table. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  onRowClick,
  rowClassName,
  empty = "No rows",
  dense,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  onRowClick?: (r: T) => void;
  rowClassName?: (r: T) => string | undefined;
  empty?: ReactNode;
  dense?: boolean;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => {
      const va = f(a);
      const vb = f(b);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="border-b border-line/70 text-left text-[11px] uppercase tracking-wide text-faint">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn("px-3 py-2 font-medium whitespace-nowrap", c.sort && "cursor-pointer select-none hover:text-fg", c.align === "right" && "text-right", c.className)}
                onClick={() => c.sort && setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted">
                {empty}
              </td>
            </tr>
          )}
          {sorted.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn("border-b border-line/40 last:border-0 hover:bg-surface-2/60", onRowClick && "cursor-pointer", rowClassName?.(r))}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 whitespace-nowrap", dense ? "py-1.5" : "py-2", c.align === "right" && "text-right", c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
