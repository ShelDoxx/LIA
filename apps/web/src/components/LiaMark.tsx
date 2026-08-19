export function LiaMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span className="font-serif tracking-tight">Lía</span>
      <span className="mb-1 inline-block h-2 w-2 rounded-full bg-gold" title="En línea" />
    </span>
  );
}
