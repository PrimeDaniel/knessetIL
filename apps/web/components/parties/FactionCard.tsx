import Link from "next/link";
import { Users } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import type { Faction } from "@knesset/types";

interface FactionCardProps {
  faction: Faction;
  className?: string;
}

export function FactionCard({ faction, className }: FactionCardProps) {
  const maxKnesset = faction.knessets.length > 0 ? Math.max(...faction.knessets) : null;
  const isActive = !faction.finish_date;

  return (
    <Link
      href={`/parties/${faction.id}`}
      className={cn(
        "block rounded-lg border border-border bg-card p-4",
        "hover:bg-accent/30 hover:border-primary/30 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-snug">{faction.name}</h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {faction.member_count} חברים
            </span>
            {maxKnesset && (
              <span>כנסת {maxKnesset}</span>
            )}
          </div>

          {faction.cohesion_score != null && (
            <div className="mt-2 text-xs text-muted-foreground">
              לכידות:{" "}
              <span className="font-medium text-foreground">
                {formatPercent(faction.cohesion_score)}
              </span>
            </div>
          )}
        </div>

        {isActive && (
          <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            פעילה
          </span>
        )}
      </div>
    </Link>
  );
}
