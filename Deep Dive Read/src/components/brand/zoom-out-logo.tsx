export function ZoomOutLogo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      role="img"
      aria-label="Zoom Out logo"
      width={size}
      height={size}
      className={className}
    >
      <g stroke="#b8a4ed" strokeWidth={9} strokeLinecap="round" fill="none">
        <path d="M30 10 H18 a8 8 0 0 0 -8 8 V30" />
        <path d="M98 10 H110 a8 8 0 0 1 8 8 V30" />
        <path d="M30 118 H18 a8 8 0 0 1 -8 -8 V98" />
        <path d="M98 118 H110 a8 8 0 0 0 8 -8 V98" />
      </g>
      <g stroke="#ffb084" strokeWidth={9} strokeLinecap="round" fill="none">
        <path d="M42 28 H36 a8 8 0 0 0 -8 8 V42" />
        <path d="M86 28 H92 a8 8 0 0 1 8 8 V42" />
        <path d="M42 100 H36 a8 8 0 0 1 -8 -8 V86" />
        <path d="M86 100 H92 a8 8 0 0 0 8 -8 V86" />
      </g>
      <rect x={36} y={45} width={56} height={38} rx={12} fill="#ff4d8b" />
      <rect x={48} y={54} width={32} height={20} rx={7} fill="#fffaf0" />
      <rect x={58} y={60} width={12} height={8} rx={3.5} fill="#ff4d8b" />
    </svg>
  );
}

export function ZoomOutIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      role="img"
      aria-label="Zoom Out icon"
      width={size}
      height={size}
      className={className}
    >
      <rect x={0} y={0} width={128} height={128} rx={28} fill="#fffaf0" />
      <rect x={1.5} y={1.5} width={125} height={125} rx={26.5} fill="none" stroke="#e5e5e5" strokeWidth={3} />
      <g stroke="#0a0a0a" strokeWidth={10} strokeLinecap="round" fill="none">
        <path d="M40 20 H30 a10 10 0 0 0 -10 10 V40" />
        <path d="M88 20 H98 a10 10 0 0 1 10 10 V40" />
        <path d="M40 108 H30 a10 10 0 0 1 -10 -10 V88" />
        <path d="M88 108 H98 a10 10 0 0 0 10 -10 V88" />
      </g>
      <rect x={34} y={44} width={60} height={40} rx={12} fill="#ff4d8b" />
      <rect x={47} y={53} width={34} height={22} rx={7} fill="#fffaf0" />
      <rect x={58} y={60} width={12} height={8} rx={3.5} fill="#ff4d8b" />
    </svg>
  );
}
