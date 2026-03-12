import Link from "next/link";
import { cn, formatDateHe, truncateHebrew } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/VoteBadge";
import { User2, Calendar } from "lucide-react";
import type { Bill } from "@knesset/types";

interface BillCardProps {
  bill: Bill;
  className?: string;
}

export function BillCard({ bill, className }: BillCardProps) {
  const primaryInitiator = bill.initiators[0];

  return (
    <Link
      href={`/bills/${bill.bill_id}`}
      className={cn(
        "block rounded-lg border border-border bg-card p-4",
        "hover:bg-accent/30 hover:border-primary/30 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-snug line-clamp-2">
            {bill.name || "ללא שם"}
          </h3>

          {bill.summary_law && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {truncateHebrew(bill.summary_law, 120)}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {primaryInitiator && (
              <span className="flex items-center gap-1">
                <User2 className="h-3 w-3" />
                {primaryInitiator.mk_name}
                {bill.initiators.length > 1 && ` +${bill.initiators.length - 1}`}
              </span>
            )}
            {bill.publication_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDateHe(bill.publication_date)}
              </span>
            )}
            <span className="text-muted-foreground/60">כנסת {bill.knesset_num}</span>
          </div>
        </div>

        <StatusBadge status={bill.status_desc} className="shrink-0 mt-0.5" />
      </div>
    </Link>
  );
}
