"use client";

import { ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, totalPages, total, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  return (
    <div className={cn("flex items-center justify-between gap-2 text-sm", className)}>
      <span className="text-muted-foreground">
        סה"כ {total.toLocaleString("he-IL")} רשומות
      </span>

      <div className="flex items-center gap-1">
        {/* Next (RTL: visually on right) */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="עמוד הבא"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={cn(
                "min-w-[32px] h-8 rounded-md px-2 text-sm font-medium transition-colors",
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground"
              )}
            >
              {(p as number).toLocaleString("he-IL")}
            </button>
          )
        )}

        {/* Prev (RTL: visually on left) */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="עמוד קודם"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function buildPageList(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const result: (number | "...")[] = [1];
  if (current > 3) result.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) result.push(p);
  if (current < total - 2) result.push("...");
  result.push(total);
  return result;
}
