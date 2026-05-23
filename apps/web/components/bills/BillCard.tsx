import { cn, formatDateHe } from "@/lib/utils";
import { User2, Calendar } from "lucide-react";
import type { Bill } from "@knesset/types";

interface BillCardProps {
  bill: Bill;
  onSelect: (id: number) => void;
  className?: string;
}

function statusAccent(statusId: number): string {
  if (statusId === 13) return "border-s-green-500";
  if (statusId === 6)  return "border-s-emerald-400";
  if (statusId === 4)  return "border-s-indigo-400";
  if (statusId === 5)  return "border-s-blue-400";
  if (statusId === 7 || statusId === 8 || statusId === 9) return "border-s-red-400";
  if (statusId === 2 || statusId === 3) return "border-s-violet-400";
  return "border-s-border";
}

function statusPill(statusId: number, desc: string) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap";
  if (statusId === 13) return <span className={cn(base, "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300")}>{desc}</span>;
  if (statusId === 6)  return <span className={cn(base, "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300")}>{desc}</span>;
  if (statusId === 4 || statusId === 5) return <span className={cn(base, "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300")}>{desc}</span>;
  if (statusId === 7 || statusId === 8 || statusId === 9) return <span className={cn(base, "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300")}>{desc}</span>;
  return <span className={cn(base, "bg-muted text-muted-foreground")}>{desc}</span>;
}

export function BillCard({ bill, onSelect, className }: BillCardProps) {
  const primaryInitiator = bill.initiators?.[0];
  const extraCount = (bill.initiators?.length ?? 0) - 1;

  return (
    <button
      type="button"
      onClick={() => onSelect(bill.bill_id)}
      className={cn(
        "group w-full text-start flex items-stretch rounded-xl border border-border border-s-4 bg-card shadow-card",
        "hover:shadow-card-md hover:border-primary/20 hover:-translate-y-px transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        statusAccent(bill.status_id),
        className
      )}
    >
      <div className="flex-1 min-w-0 p-4">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
          {bill.name || "ללא שם"}
        </h3>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {statusPill(bill.status_id, bill.status_desc)}
          <span className="text-[11px] text-muted-foreground">כנסת {bill.knesset_num}</span>
          {bill.publication_date && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDateHe(bill.publication_date)}
            </span>
          )}
        </div>

        {primaryInitiator && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <User2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{primaryInitiator.mk_name}</span>
            {extraCount > 0 && <span className="shrink-0">+{extraCount}</span>}
          </p>
        )}
      </div>
    </button>
  );
}
