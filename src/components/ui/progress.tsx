import { cn } from "@/lib/utils";

export function Progress({
  value,
  tone = "primary",
  className,
}: {
  /** 0–100; valores acima de 100 são exibidos como 100 na barra. */
  value: number;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, value));
  const color =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : "bg-primary";

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${width}%` }} />
    </div>
  );
}
