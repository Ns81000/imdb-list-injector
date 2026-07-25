import { useEffect, useState } from "react";
import { posterUrl, hashBrand, initials } from "@/lib/utils";
import type { BrandColor } from "@/lib/utils";
import { FilmIcon } from "../icons";

const bg: Record<BrandColor, string> = {
  "brand-pink": "bg-[var(--brand-pink)]",
  "brand-teal": "bg-[var(--brand-teal)]",
  "brand-lavender": "bg-[var(--brand-lavender)]",
  "brand-peach": "bg-[var(--brand-peach)]",
  "brand-ochre": "bg-[var(--brand-ochre)]",
  "brand-mint": "bg-[var(--brand-mint)]",
};

export function MoviePoster({
  path,
  title,
  size = "w342",
  className = "",
}: {
  path: string | null;
  title: string;
  size?: "w342" | "w780" | "w185";
  className?: string;
}) {
  const [error, setError] = useState(false);
  const url = posterUrl(path, size);
  // Reset error when the underlying image URL changes; otherwise a component
  // reused across items would remain permanently stuck on the fallback.
  useEffect(() => {
    setError(false);
  }, [url]);
  const color = hashBrand(title);
  if (!url || error) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 p-3 text-center ${bg[color]} ${className}`}
      >
        <FilmIcon size={22} className="opacity-70 text-[var(--on-dark)]" />
        <div className="line-clamp-3 text-[12px] font-semibold leading-tight text-[var(--on-dark)]">
          {title || initials(title)}
        </div>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={title}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
