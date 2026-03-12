import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  className?: string;
  accent?: "default" | "for" | "against" | "abstain";
}

const accentMap: Record<string, string> = {
  default: "text-foreground",
  for: "text-vote-for",
  against: "text-vote-against",
  abstain: "text-vote-abstain",
};

export function StatCard({ label, value, subLabel, className, accent = "default" }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-6",
        "flex flex-col gap-1",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("text-3xl font-bold tabular-nums", accentMap[accent])}>
        {typeof value === "number" ? value.toLocaleString("he-IL") : value}
      </p>
      {subLabel && (
        <p className="text-xs text-muted-foreground/70 mt-1">{subLabel}</p>
      )}
    </div>
  );
}
