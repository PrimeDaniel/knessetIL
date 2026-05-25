import Link from "next/link";
import { cn } from "@/lib/utils";
import { MKAvatar } from "./MKAvatar";
import type { MKProfile } from "@knesset/types";

interface MKCardProps {
  mk: MKProfile;
  className?: string;
}

export function MKCard({ mk, className }: MKCardProps) {
  return (
    <Link
      href={`/members/${mk.mk_individual_id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3",
        "hover:bg-accent/30 hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-card-md transition-all",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className
      )}
    >
      <MKAvatar
        name={mk.mk_individual_name}
        firstName={mk.mk_individual_first_name}
        photoUrl={mk.mk_individual_photo}
        seed={mk.mk_individual_id}
        size={48}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight truncate">
          {mk.mk_individual_name}
        </p>
        {mk.current_faction && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {mk.current_faction.name}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          {mk.is_coalition === true && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              קואליציה
            </span>
          )}
          {mk.is_coalition === false && (
            <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              אופוזיציה
            </span>
          )}
          {mk.knessets.length > 0 && (
            <span className="text-[10px] text-muted-foreground/70">
              כנסת {Math.max(...mk.knessets)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
