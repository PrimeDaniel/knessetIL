import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  icon?: LucideIcon;
  className?: string;
  accent?: "default" | "for" | "against" | "abstain";
}

const accentMap: Record<string, { value: string; bg: string; icon: string }> = {
  default: { value: "text-foreground",     bg: "",                          icon: "text-muted-foreground" },
  for:     { value: "text-vote-for",        bg: "bg-green-50 dark:bg-green-950/30",  icon: "text-vote-for" },
  against: { value: "text-vote-against",    bg: "bg-red-50 dark:bg-red-950/30",      icon: "text-vote-against" },
  abstain: { value: "text-vote-abstain",    bg: "bg-amber-50 dark:bg-amber-950/30",  icon: "text-vote-abstain" },
};

export function StatCard({ label, value, subLabel, icon: Icon, className, accent = "default" }: StatCardProps) {
  const a = accentMap[accent];
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-5 shadow-card flex flex-col gap-2",
      a.bg,
      className
    )}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        {Icon && <Icon className={cn("h-4 w-4", a.icon)} />}
      </div>
      <p className={cn("text-3xl font-bold tabular-nums leading-none", a.value)}>
        {typeof value === "number" ? value.toLocaleString("he-IL") : value}
      </p>
      {subLabel && (
        <p className="text-xs text-muted-foreground">{subLabel}</p>
      )}
    </div>
  );
}
