import type { ReactNode } from "react";
import { ZoomOutLogo } from "../brand/zoom-out-logo";

export function EmptyState({
  title,
  description,
  action,
  showLogo = true,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  showLogo?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[24px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-12 text-center">
      {showLogo && (
        <div className="zo-float">
          <ZoomOutLogo size={72} />
        </div>
      )}
      <div>
        <div className="title-md text-[var(--ink)]">{title}</div>
        {description && (
          <div className="body-sm mt-2 max-w-md text-[var(--muted)]">{description}</div>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
