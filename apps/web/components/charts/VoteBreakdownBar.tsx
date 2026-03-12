"use client";

/**
 * VoteBreakdownBar — horizontal stacked bar showing For/Against/Abstain totals.
 * Works with aggregate data from view_vote_rslts_hdr_approved (no per-MK data needed).
 * SVG-based (Recharts) so it inherits dir="rtl" naturally.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { cn } from "@/lib/utils";

interface VoteBreakdownBarProps {
  totalFor: number;
  totalAgainst: number;
  totalAbstain: number;
  className?: string;
  showLabels?: boolean;
}

const COLORS = {
  for:     "#16a34a",
  against: "#dc2626",
  abstain: "#d97706",
};

const LABELS = {
  for:     "בעד",
  against: "נגד",
  abstain: "נמנע",
};

export function VoteBreakdownBar({
  totalFor,
  totalAgainst,
  totalAbstain,
  className,
  showLabels = true,
}: VoteBreakdownBarProps) {
  const total = totalFor + totalAgainst + totalAbstain || 1;

  const data = [
    { name: LABELS.for,     value: totalFor,     pct: Math.round((totalFor / total) * 100),     color: COLORS.for },
    { name: LABELS.against, value: totalAgainst, pct: Math.round((totalAgainst / total) * 100), color: COLORS.against },
    { name: LABELS.abstain, value: totalAbstain, pct: Math.round((totalAbstain / total) * 100), color: COLORS.abstain },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Stacked percentage bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-full border border-border">
        {data.map((d) => (
          <div
            key={d.name}
            style={{ width: `${(d.value / total) * 100}%`, backgroundColor: d.color }}
            className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
            title={`${d.name}: ${d.value} (${d.pct}%)`}
          >
            {d.pct >= 10 ? `${d.pct}%` : ""}
          </div>
        ))}
      </div>

      {/* Legend */}
      {showLabels && (
        <div className="flex justify-between text-sm">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-muted-foreground">{d.name}</span>
              <span className="font-semibold tabular-nums">
                {d.value.toLocaleString("he-IL")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Recharts bar chart variant — used on the vote detail page for party breakdown */
export function VoteBarChart({
  totalFor,
  totalAgainst,
  totalAbstain,
  className,
}: VoteBreakdownBarProps) {
  const data = [
    { name: LABELS.for,     value: totalFor,     fill: COLORS.for },
    { name: LABELS.against, value: totalAgainst, fill: COLORS.against },
    { name: LABELS.abstain, value: totalAbstain, fill: COLORS.abstain },
  ];

  return (
    <div className={cn("w-full h-48", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="name" tick={{ fontSize: 13, fontFamily: "Heebo" }} />
          <YAxis tick={{ fontSize: 12 }} width={40} />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString("he-IL"), "קולות"]}
            contentStyle={{ fontFamily: "Heebo", direction: "rtl" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
            <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontFamily: "Heebo" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
