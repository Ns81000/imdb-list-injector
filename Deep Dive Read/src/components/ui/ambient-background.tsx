export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none" aria-hidden="true">
      {/* Pure, clean, minimalist warm clay canvas background */}
      <div className="absolute inset-0 bg-[#fffaf0]" />
    </div>
  );
}
