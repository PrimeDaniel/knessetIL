"use client";

/**
 * RebellionRateGauge — radial progress indicator for MK rebellion rate.
 * Shows "N/A" gracefully when data is unavailable (per-MK vote decisions
 * are not in the public oknesset CSV data).
 */
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils";

interface RebellionRateGaugeProps {
  rate: number | null;  // 0–1 float, or null if unavailable
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = { sm: "h-24 w-24", md: "h-32 w-32", lg: "h-40 w-40" };
const textSizeMap = { sm: "text-lg", md: "text-2xl", lg: "text-3xl" };

function rateColor(rate: number): string {
  if (rate < 0.05) return "#16a34a"; // low rebellion — green
  if (rate < 0.15) return "#d97706"; // moderate — amber
  return "#dc2626";                  // high rebellion — red
}

export function RebellionRateGauge({
  rate,
  label = "אחוז מרידה",
  className,
  size = "md",
}: RebellionRateGaugeProps) {
  if (rate === null) {
    return (
      <div className={cn("flex flex-col items-center gap-2", className)}>
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-muted",
            sizeMap[size],
          )}
        >
          <span className="text-sm text-muted-foreground">N/A</span>
        </div>
        <p className="text-xs text-muted-foreground text-center">{label}</p>
        <p className="text-[10px] text-muted-foreground/60 text-center max-w-[120px]">
          נתונים לא זמינים במקור הציבורי
        </p>
      </div>
    );
  }

  const color = rateColor(rate);
  const data = [{ value: rate * 100, fill: color }];

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className={cn("relative", sizeMap[size])}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "hsl(var(--muted))" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        {/* Centre text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold tabular-nums", textSizeMap[size])} style={{ color }}>
            {formatPercent(rate, 0)}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
