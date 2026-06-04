import { cn } from "@/lib/utils";

interface CohesionGaugeProps {
  /** 0-1 cohesion score, or null if no data */
  value: number | null;
  /** Total SVG width in pixels (height auto = width × 0.62) */
  size?: number;
  /** Optional caption shown under the percentage */
  caption?: string;
  className?: string;
}

const TRACK = "hsl(var(--muted))";
const ARC_LENGTH = Math.PI * 40; // r=40 → ~125.66

function gradeColor(value: number): string {
  if (value >= 0.85) return "hsl(var(--vote-for))";
  if (value >= 0.65) return "hsl(var(--vote-abstain))";
  return "hsl(var(--vote-against))";
}

export function CohesionGauge({
  value,
  size = 60,
  caption,
  className,
}: CohesionGaugeProps) {
  const height = Math.round(size * 0.62);
  const hasData = value != null && Number.isFinite(value);
  const clamped = hasData ? Math.max(0, Math.min(1, value)) : 0;
  const offset = ARC_LENGTH * (1 - clamped);
  const color = hasData ? gradeColor(clamped) : TRACK;

  // Font sizes scaled to gauge size — feel balanced at these ratios
  const pctFont = Math.round(size * 0.30);
  const captionFont = Math.round(size * 0.13);

  return (
    <div
      className={cn("relative inline-flex flex-col items-center", className)}
      style={{ width: size }}
      aria-label={hasData ? `לכידות ${Math.round(clamped * 100)} אחוז` : "אין נתוני לכידות"}
    >
      <svg
        viewBox="0 0 100 55"
        width={size}
        height={height}
        className="block overflow-visible"
      >
        {/* Track */}
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke={TRACK}
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {hasData && (
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1) 250ms",
            }}
          />
        )}
      </svg>

      {/* Centered percentage, positioned over the arc */}
      <div
        className="absolute inset-x-0 flex flex-col items-center pointer-events-none"
        style={{ top: height * 0.46 }}
      >
        <span
          className="font-serif font-semibold leading-none tracking-tight"
          style={{ fontSize: pctFont, color: hasData ? color : "hsl(var(--muted-foreground))" }}
        >
          {hasData ? `${Math.round(clamped * 100)}%` : "—"}
        </span>
        {caption && (
          <span
            className="mt-0.5 font-mono uppercase tracking-wider text-muted-foreground"
            style={{ fontSize: captionFont }}
          >
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
