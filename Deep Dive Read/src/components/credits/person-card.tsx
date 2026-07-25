import { useEffect, useState } from "react";
import { profileUrl, hashBrand, initials } from "@/lib/utils";
import type { BrandColor } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { searchPerson } from "@/lib/tmdb.functions";

const bg: Record<BrandColor, string> = {
  "brand-pink": "bg-[var(--brand-pink)]",
  "brand-teal": "bg-[var(--brand-teal)]",
  "brand-lavender": "bg-[var(--brand-lavender)]",
  "brand-peach": "bg-[var(--brand-peach)]",
  "brand-ochre": "bg-[var(--brand-ochre)]",
  "brand-mint": "bg-[var(--brand-mint)]",
};

export function PersonAvatar({ name, size = 48 }: { name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const q = useQuery({
    queryKey: ["tmdb-person", name],
    queryFn: () => searchPerson({ data: { name } }),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  const url = profileUrl(q.data?.profilePath ?? null);
  useEffect(() => {
    setErr(false);
  }, [url]);
  if (!url || err) {
    const color = hashBrand(name);
    return (
      <div
        className={`flex items-center justify-center rounded-full ${bg[color]} text-[var(--on-dark)] font-semibold`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
        aria-label={name}
      >
        {initials(name)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setErr(true)}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}

interface PersonCardProps {
  name: string;
  count: number;
  onClick?: () => void;
}

export function PersonCard({ name, count, onClick }: PersonCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-[16px] border border-[var(--hairline)] bg-[var(--canvas)] p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
    >
      <PersonAvatar name={name} size={64} />
      <div>
        <div className="title-sm line-clamp-2 text-[var(--ink)]">{name}</div>
        <div className="caption mt-1 text-[var(--muted)]">
          {count} title{count === 1 ? "" : "s"}
        </div>
      </div>
    </button>
  );
}
