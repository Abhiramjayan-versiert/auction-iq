// Pure helpers that turn free text (from PDF, Word, TXT, OCR…) into spreadsheet-like rows.

/** Split lines of text into cells: tabs, then "|" , then 2+ spaces, then consistent commas. Leading list numbering is removed. */
export function textToSheet(text: string): string[][] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/ /g, " ").trim())
    .filter((l) => l && !/^[-=_.\s]+$/.test(l));
  if (!lines.length) return [];
  const useTab = lines.some((l) => l.includes("\t"));
  const usePipe = !useTab && lines.filter((l) => l.includes("|")).length >= lines.length / 2;
  const useSpaces = !useTab && !usePipe && lines.filter((l) => / {2,}/.test(l)).length >= lines.length / 2;
  const commaCounts = lines.map((l) => (l.match(/,/g) ?? []).length);
  const useComma = !useTab && !usePipe && !useSpaces && commaCounts.filter((c) => c > 0 && c === commaCounts[0]).length >= lines.length * 0.6;
  return lines.map((l) => {
    const cells = useTab ? l.split("\t") : usePipe ? l.split("|") : useSpaces ? l.split(/ {2,}/) : useComma ? l.split(",") : [l];
    const out = cells.map((c) => c.trim()).filter((c, i, a) => c !== "" || i < a.length - 1);
    // "1. Virat Kohli" / "12) Name" / "3 - Name" → drop the list number
    if (out.length === 1) {
      const m = out[0].match(/^\d{1,4}\s*[.):\-]\s*(.+)$/);
      if (m) return [m[1].trim()];
    } else if (/^\d{1,4}[.)]?$/.test(out[0]) && out.length > 1 && !/^\d/.test(out[1])) {
      return out.slice(1);
    }
    return out;
  });
}

export interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rebuild table rows from positioned PDF text: same baseline → same row; big horizontal gaps → new column. */
export function positionedTextToLines(items: PositionedText[]): string[] {
  const parts = items.filter((i) => i.str.trim() !== "");
  if (!parts.length) return [];
  const rows: PositionedText[][] = [];
  const sorted = [...parts].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const tol = Math.max(2, (it.height || 10) * 0.4);
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= tol);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => {
    r.sort((a, b) => a.x - b.x);
    let line = "";
    let lastEnd: number | null = null;
    for (const it of r) {
      const charW = it.str.length ? it.width / it.str.length : 5;
      if (lastEnd !== null) {
        const gap = it.x - lastEnd;
        line += gap > Math.max(charW * 1.8, 8) ? "\t" : gap > charW * 0.15 ? " " : "";
      }
      line += it.str;
      lastEnd = it.x + it.width;
    }
    return line.trim();
  });
}
