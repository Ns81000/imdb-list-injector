import { useEffect, useState } from "react";
import { posterUrl, hashBrand, cn } from "@/lib/utils";
import type { BrandColor } from "@/lib/utils";
import { FilmIcon } from "../icons";

const bg: Record<BrandColor, string> = {
  "brand-pink": "bg-[#ff4d8b]",
  "brand-teal": "bg-[#1a3a3a]",
  "brand-lavender": "bg-[#967adb]",
  "brand-peach": "bg-[#f58b54]",
  "brand-ochre": "bg-[#d49e24]",
  "brand-mint": "bg-[#4da890]",
  "brand-coral": "bg-[#ff6b5a]",
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

  useEffect(() => {
    setError(false);
  }, [url]);

  const color = hashBrand(title);

  // TMDB poster dimensions (2:3 aspect ratio)
  const dimensions = {
    w185: { width: 185, height: 278 },
    w342: { width: 342, height: 513 },
    w780: { width: 780, height: 1170 },
  };
  const { width, height } = dimensions[size];

  if (!url || error) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center select-none",
          bg[color],
          className,
        )}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-sm">
          <FilmIcon size={22} className="text-white opacity-90" />
        </div>
        <div className="line-clamp-4 text-xs font-bold leading-snug text-white drop-shadow-sm">
          {title}
        </div>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={title}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
