import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------ Parsing --------------------------------- */

export function parseDurationToMinutes(s: string | null | undefined): number {
  if (!s) return 0;
  const h = /(\d+)\s*h/.exec(s);
  const m = /(\d+)\s*m/.exec(s);
  return (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
}

export function formatMinutes(mins: number): string {
  if (!mins) return "0m";
  const d = Math.floor(mins / (60 * 24));
  const h = Math.floor((mins % (60 * 24)) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function parseRating(r: string | null | undefined): number | null {
  if (!r) return null;
  const n = parseFloat(r);
  return Number.isFinite(n) ? n : null;
}

export function parseVotes(v: string | null | undefined): number {
  if (!v) return 0;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseGenres(g: string | null | undefined): string[] {
  if (!g) return [];
  return g
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function primaryYear(y: string | null | undefined): number | null {
  if (!y) return null;
  const m = /(\d{4})/.exec(y);
  return m ? parseInt(m[1], 10) : null;
}

/* ------------------------------ Time ----------------------------------- */

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/* ------------------------------ Brand palette -------------------------- */

export const BRAND_COLORS = [
  "brand-pink",
  "brand-teal",
  "brand-lavender",
  "brand-peach",
  "brand-ochre",
  "brand-mint",
  "brand-coral",
] as const;

export type BrandColor = (typeof BRAND_COLORS)[number];

export function brandCycle(index: number, avoidRepeat?: BrandColor): BrandColor {
  let idx = index % BRAND_COLORS.length;
  if (avoidRepeat && BRAND_COLORS[idx] === avoidRepeat) {
    idx = (idx + 1) % BRAND_COLORS.length;
  }
  return BRAND_COLORS[idx];
}

export function isDarkBrand(c: BrandColor): boolean {
  return c === "brand-pink" || c === "brand-teal" || c === "brand-coral";
}

/** Hash a string to one of the brand colors — used for initials avatars. */
export function hashBrand(name: string): BrandColor {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return BRAND_COLORS[h % BRAND_COLORS.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/* ------------------------------ TMDB URLs ------------------------------ */

export function posterUrl(path: string | null | undefined, size = "w342"): string | null {
  if (!path) return null;
  return `/api/tmdb/image/${size}${path}`;
}
export function backdropUrl(path: string | null | undefined, size = "w1280"): string | null {
  if (!path) return null;
  return `/api/tmdb/image/${size}${path}`;
}
export function profileUrl(path: string | null | undefined, size = "w185"): string | null {
  if (!path) return null;
  return `/api/tmdb/image/${size}${path}`;
}

export function formatOrDash(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
