export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function fmtMoney(n: number | null | undefined, unit = "Cr") {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const v = round2(n);
  const s = Number.isInteger(v) ? v.toString() : v.toFixed(2).replace(/0$/, "");
  return `₹${s} ${unit}`;
}

export function fmtRating(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

export function fmtPct(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

/** Round down to a bid increment so suggestions are always valid bids. */
export function floorToIncrement(n: number, inc: number) {
  if (!inc || inc <= 0) return round2(n);
  return round2(Math.floor((n + 1e-9) / inc) * inc);
}

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
