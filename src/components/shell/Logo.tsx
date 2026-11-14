export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ""}`}>
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[11px] font-black text-accent-ink">IQ</span>
      <span>AUCTION <span className="text-accent">IQ</span></span>
    </span>
  );
}
