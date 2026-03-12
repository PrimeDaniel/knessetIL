import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
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
        "hover:bg-accent/30 hover:border-primary/30 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className
      )}
    >
      {/* Photo */}
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
        {mk.mk_individual_photo ? (
          <Image
            src={mk.mk_individual_photo}
            alt={mk.mk_individual_name}
            fill
            className="object-cover"
            sizes="48px"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
            {mk.mk_individual_first_name?.[0] ?? "?"}
          </div>
        )}
      </div>

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
        <div className="mt-1 flex items-center gap-2">
          {mk.is_current && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              נוכחי
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
