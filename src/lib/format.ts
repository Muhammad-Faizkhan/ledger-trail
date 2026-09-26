export const APP_NAME = "LedgerTrail";

const moneyFmt = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });

/** Rounds away binary-float noise (e.g. 3 * 0.1) for display and comparison. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(n: number): string {
  const r = round2(n);
  return `${r < 0 ? "-" : ""}Rs ${moneyFmt.format(Math.abs(r))}`;
}

export function num(n: number): string {
  return moneyFmt.format(round2(n));
}

/** True when two currency amounts differ by at least one paisa. */
export function amountsDiffer(a: number, b: number): boolean {
  return Math.abs(round2(a) - round2(b)) >= 0.01;
}

/** Local calendar date as YYYY-MM-DD. */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from a YYYY-MM-DD date to `asOf` (also YYYY-MM-DD). */
export function daysBetween(from: string, asOf: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+asOf.slice(0, 4), +asOf.slice(5, 7) - 1, +asOf.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Normalizes a stored phone number into the digits-only international form
 * wa.me expects. Pakistani local formats (03xx..., 3xx...) get the 92 prefix.
 * Returns null when there is nothing usable to dial.
 */
export function whatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = "92" + digits.slice(1);
  } else if (digits.startsWith("3") && digits.length === 10) {
    digits = "92" + digits;
  }
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function whatsAppUrl(phone: string, text: string): string | null {
  const n = whatsAppNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export function parsePositiveNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseNonNegativeNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
