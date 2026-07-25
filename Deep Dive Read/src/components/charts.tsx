import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Movie } from "@/types";
import { parseRating, parseGenres, primaryYear, parseDurationToMinutes } from "@/lib/utils";

const brand = {
  pink: "#ff4d8b",
  teal: "#1a3a3a",
  lavender: "#b8a4ed",
  peach: "#ffb084",
  ochre: "#e8b94a",
  mint: "#a4d4c5",
  coral: "#ff6b5a",
};

const tooltipStyle = {
  background: "var(--surface-dark)",
  color: "var(--on-dark)",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  padding: "6px 10px",
};

export function RatingHistogram({ movies, height = 240 }: { movies: Movie[]; height?: number }) {
  const data = useMemo(() => {
    const bins: Record<string, number> = {};
    for (let x = 1; x < 10; x += 0.5) {
      const label = `${x.toFixed(1)}`;
      bins[label] = 0;
    }
    for (const m of movies) {
      const r = parseRating(m.rating);
      if (r === null) continue;
      const floor = Math.max(1, Math.min(9.5, Math.floor(r * 2) / 2));
      const label = floor.toFixed(1);
      bins[label] = (bins[label] ?? 0) + 1;
    }
    return Object.entries(bins).map(([bin, count]) => ({ bin, count }));
  }, [movies]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
        <XAxis dataKey="bin" stroke="var(--muted-soft)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--muted-soft)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-soft)" }} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((_d, i) => {
            const t = i / Math.max(1, data.length - 1);
            const color = t < 0.5
              ? interpolate(brand.coral, brand.ochre, t * 2)
              : interpolate(brand.ochre, brand.mint, (t - 0.5) * 2);
            return <Cell key={i} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function interpolate(a: string, b: string, t: number) {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

const palette = [brand.pink, brand.teal, brand.lavender, brand.peach, brand.ochre, brand.mint, brand.coral];

export function GenreBars({ movies, top = 20, height = 400 }: { movies: Movie[]; top?: number; height?: number }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of movies) {
      for (const g of parseGenres(m.genre)) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([genre, count]) => ({ genre, count }));
  }, [movies, top]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 4 }}>
        <XAxis type="number" stroke="var(--muted-soft)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="genre" stroke="var(--muted)" fontSize={12} width={110} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-soft)" }} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} label={{ position: "right", fill: "var(--muted)", fontSize: 11 }}>
          {data.map((_d, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function YearTimeline({ movies, height = 240 }: { movies: Movie[]; height?: number }) {
  const data = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of movies) {
      const y = primaryYear(m.year);
      if (y === null) continue;
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year, count }));
  }, [movies]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
        <defs>
          <linearGradient id="yearGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={brand.lavender} stopOpacity={0.6} />
            <stop offset="100%" stopColor={brand.lavender} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="year" stroke="var(--muted-soft)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--muted-soft)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="count" stroke={brand.lavender} strokeWidth={2} fill="url(#yearGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RuntimeDistribution({ movies, height = 240 }: { movies: Movie[]; height?: number }) {
  const data = useMemo(() => {
    const buckets = [
      { label: "<60m", min: 0, max: 60, count: 0 },
      { label: "60–90m", min: 60, max: 90, count: 0 },
      { label: "90–120m", min: 90, max: 120, count: 0 },
      { label: "120–150m", min: 120, max: 150, count: 0 },
      { label: "150–180m", min: 150, max: 180, count: 0 },
      { label: "180m+", min: 180, max: Infinity, count: 0 },
    ];
    for (const m of movies) {
      const mins = parseDurationToMinutes(m.duration);
      if (mins <= 0) continue;
      const b = buckets.find((x) => mins >= x.min && mins < x.max);
      if (b) b.count++;
    }
    return buckets;
  }, [movies]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
        <XAxis dataKey="label" stroke="var(--muted-soft)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--muted-soft)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-soft)" }} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={brand.peach} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ContentRatingDonut({ movies, height = 260 }: { movies: Movie[]; height?: number }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of movies) {
      const key = (m.content_rating && m.content_rating.trim()) || "NR";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [movies]);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="name">
            {data.map((_d, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="display-md">{total}</div>
        <div className="caption text-[var(--muted)]">total</div>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-3 text-[12px]">
        {data.map((d, i) => (
          <span key={d.name} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: palette[i % palette.length] }} />
            <span className="text-[var(--body)]">{d.name}</span>
            <span className="text-[var(--muted)]">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function TypeBars({ movies, height = 200 }: { movies: Movie[]; height?: number }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of movies) {
      const t = m.type ?? "Unknown";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  }, [movies]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 4 }}>
        <XAxis type="number" stroke="var(--muted-soft)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="type" stroke="var(--muted)" fontSize={12} width={110} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-soft)" }} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
          {data.map((_d, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function KeywordCloud({ movies, top = 60 }: { movies: Movie[]; top?: number }) {
  const words = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of movies) {
      for (const k of m.keywords ?? []) {
        const key = k.trim().toLowerCase();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  }, [movies, top]);
  if (words.length === 0) return null;
  const max = words[0][1];
  const min = words[words.length - 1][1];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-4">
      {words.map(([w, c], i) => {
        const t = max === min ? 0.5 : (c - min) / (max - min);
        const size = 12 + t * 22;
        const color = palette[i % palette.length];
        return (
          <span
            key={w}
            className="rounded-full px-3 py-1 font-semibold"
            style={{ fontSize: size, color, background: `${color}18` }}
            title={`${c} title${c === 1 ? "" : "s"}`}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

export function DirectorLeaderboard({ movies, top = 15 }: { movies: Movie[]; top?: number }) {
  const list = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of movies) {
      for (const d of m.credits?.Director ?? []) {
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  }, [movies, top]);
  const max = list[0]?.[1] ?? 1;
  return (
    <div className="flex flex-col divide-y divide-[var(--hairline-soft)]">
      {list.map(([name, count], i) => (
        <div key={name} className="flex items-center gap-4 py-3">
          <div className="w-6 text-right caption text-[var(--muted-soft)]">{i + 1}</div>
          <div className="flex-1">
            <div className="title-sm text-[var(--ink)]">{name}</div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-soft)]">
              <div
                className="h-full rounded-full bg-[var(--brand-pink)]"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </div>
          <div className="caption text-[var(--muted)]">{count}</div>
        </div>
      ))}
    </div>
  );
}
