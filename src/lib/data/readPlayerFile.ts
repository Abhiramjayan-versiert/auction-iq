"use client";
// Reads any supported upload into rows (array of rows of cells), entirely in the browser.
// Supported: Excel (.xlsx/.xlsm), CSV/TSV/TXT, JSON, PDF (text or scanned via OCR), Word (.docx),
// and images of printed lists (PNG/JPG/WEBP via OCR, beta). Nothing is uploaded to a server.
import Papa from "papaparse";
import { positionedTextToLines, textToSheet, type PositionedText } from "./textToSheet";

export const PLAYER_FILE_ACCEPT =
  ".xlsx,.xlsm,.xls,.csv,.tsv,.txt,.json,.pdf,.docx,.doc,.ods,.png,.jpg,.jpeg,.webp,text/csv,text/plain,application/pdf,application/json,image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const SUPPORTED_FORMATS_LABEL = "Excel (.xlsx), CSV, TSV, TXT, JSON, PDF, Word (.docx) or a photo of a printed list";

export interface FileRows {
  rows: unknown[][];
  source: string;
  notes: string[];
  /** all non-empty sheets of a workbook, so the organiser can pick another one */
  sheets?: { name: string; rows: unknown[][] }[];
}

const ext = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

async function readPdf(file: File, onProgress?: (m: string) => void): Promise<FileRows> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(`Reading PDF page ${p}/${doc.numPages}…`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PositionedText[] = (content.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
      .filter((i) => typeof i.str === "string" && i.transform)
      .map((i) => ({ str: i.str as string, x: i.transform![4], y: i.transform![5], width: i.width ?? 0, height: i.height ?? Math.abs(i.transform![3]) }));
    lines.push(...positionedTextToLines(items));
  }
  if (lines.join("").trim().length > 0) return { rows: textToSheet(lines.join("\n")), source: `PDF (${doc.numPages} page${doc.numPages === 1 ? "" : "s"})`, notes: [] };
  // Scanned PDF: no text layer → render pages and OCR them
  const notes = ["This PDF has no text layer (it looks scanned), so text was recognised with OCR — please check the names."];
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const texts: string[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 15); p++) {
      onProgress?.(`Recognising text on page ${p}/${doc.numPages} (OCR)…`);
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      texts.push((await worker.recognize(canvas)).data.text);
    }
  } finally {
    await worker.terminate();
  }
  if (doc.numPages > 15) notes.push("Only the first 15 pages were read.");
  return { rows: textToSheet(texts.join("\n")), source: "Scanned PDF (OCR)", notes };
}

async function readImage(file: File, onProgress?: (m: string) => void): Promise<FileRows> {
  onProgress?.("Recognising text in the image (OCR)…");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    return { rows: textToSheet(data.text), source: "Image (OCR)", notes: ["Names were read from the image with OCR — check spelling before importing."] };
  } finally {
    await worker.terminate();
  }
}

async function readDocx(file: File): Promise<FileRows> {
  const mammoth = await import("mammoth");
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const dom = new DOMParser().parseFromString(html, "text/html");
  const tables = [...dom.querySelectorAll("table")];
  if (tables.length) {
    const rows = tables.flatMap((t) => [...t.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("td,th")].map((c) => (c.textContent ?? "").trim())));
    return { rows, source: `Word table${tables.length > 1 ? `s (${tables.length})` : ""}`, notes: [] };
  }
  const text = [...dom.querySelectorAll("p,li")].map((p) => (p.textContent ?? "").trim()).join("\n");
  return { rows: textToSheet(text), source: "Word document", notes: [] };
}

function readJson(text: string): FileRows {
  const data = JSON.parse(text) as unknown;
  const arr = Array.isArray(data) ? data : Array.isArray((data as { players?: unknown[] })?.players) ? (data as { players: unknown[] }).players : null;
  if (!arr) throw new Error("JSON must be a list of players or { \"players\": [...] }");
  if (arr.every((x) => typeof x === "string")) return { rows: (arr as string[]).map((n) => [n]), source: "JSON", notes: [] };
  const objs = arr.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  const headers = [...new Set(objs.flatMap((o) => Object.keys(o)))];
  return { rows: [headers, ...objs.map((o) => headers.map((h) => o[h] ?? ""))], source: "JSON", notes: [] };
}

export async function readPlayerFile(file: File, onProgress?: (m: string) => void): Promise<FileRows> {
  const e = ext(file.name);
  const type = file.type;
  if (e === "xls" || e === "ods" || e === "doc")
    throw new Error(
      e === "doc"
        ? "Old Word .doc files can't be read. Save it as .docx (File → Save As) or as PDF."
        : `.${e} files can't be read directly. Save the sheet as .xlsx or CSV (File → Save As / Download as) and upload that.`,
    );
  if (e === "xlsx" || e === "xlsm") {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const all = ((await readXlsxFile(file)) as { sheet: string; data: unknown[][] }[])
      .map((s) => ({ name: s.sheet, rows: s.data }))
      .filter((s) => s.rows.some((r) => r.some((c) => c !== null && String(c).trim() !== "")));
    if (!all.length) throw new Error("The workbook has no data.");
    // start with the sheet that has the most filled rows
    const first = [...all].sort((a, b) => b.rows.length - a.rows.length)[0];
    return { rows: first.rows, source: `Excel sheet “${first.name}”`, notes: [], sheets: all.length > 1 ? all : undefined };
  }
  if (e === "pdf" || type === "application/pdf") return readPdf(file, onProgress);
  if (e === "docx") return readDocx(file);
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(e)) return readImage(file, onProgress);
  const text = await file.text();
  if (e === "json" || type === "application/json") return readJson(text);
  if (e === "csv" || e === "tsv" || type === "text/csv") {
    return { rows: Papa.parse<unknown[]>(text, { skipEmptyLines: true, delimiter: e === "tsv" ? "\t" : "" }).data, source: e.toUpperCase(), notes: [] };
  }
  // .txt or anything text-like: one player per line (optionally with columns)
  if (/[\u0000-\u0008]/.test(text.slice(0, 2000))) throw new Error(`Unsupported file type. Upload ${SUPPORTED_FORMATS_LABEL}.`);
  return { rows: textToSheet(text), source: "Text", notes: [] };
}
