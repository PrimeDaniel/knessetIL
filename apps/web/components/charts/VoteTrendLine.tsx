"use client";

/**
 * VoteTrendLine — line chart of accepted vs rejected votes over time.
 * Used on the homepage dashboard and party profile pages.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatDateHe } from "@/lib/utils";

interface TrendPoint {
  date: string;
  accepted: number;
  rejected: number;
}

interface VoteTrendLineProps {
  data: TrendPoint[];
  className?: string;
}

export function VoteTrendLine({ data, className }: VoteTrendLineProps) {
  if (!data.length) {
    return (
      <div className={cn("flex h-48 items-center justify-center text-muted-foreground text-sm", className)}>
        אין נתונים להצגה
      </div>
    );
  }

  return (
    <div className={cn("w-full h-56", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fontFamily: "Heebo" }}
            tickFormatter={(d) => d.slice(0, 7)} // YYYY-MM
          />
          <YAxis tick={{ fontSize: 11 }} width={32} />
          <Tooltip
            labelFormatter={(d) => formatDateHe(d as string)}
            formatter={(value: number, name: string) => [
              value.toLocaleString("he-IL"),
              name === "accepted" ? "עבר" : "נדחה",
            ]}
            contentStyle={{ fontFamily: "Heebo", direction: "rtl" }}
          />
          <Legend
            formatter={(value) => (value === "accepted" ? "עבר" : "נדחה")}
            wrapperStyle={{ fontFamily: "Heebo", fontSize: 13 }}
          />
          <Line
            type="monotone"
            dataKey="accepted"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="rejected"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
