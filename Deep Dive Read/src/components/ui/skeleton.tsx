import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("zo-skeleton rounded-[12px]", className)} />;
}
