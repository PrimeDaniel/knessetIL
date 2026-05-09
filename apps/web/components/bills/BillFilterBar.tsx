"use client";

import { useQueryState } from "nuqs";
import { SearchInput } from "@/components/shared/SearchInput";
import { useDebounce } from "@/hooks/useDebounce";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, X } from "lucide-react";

const STATUS_PILLS = [
  { id: "",   label: "הכל" },
  { id: "13", label: "הפך לחוק" },
  { id: "6",  label: "עבר ג׳ קריאות" },
  { id: "4",  label: "קריאה ראשונה" },
  { id: "5",  label: "בוועדה" },
  { id: "7",  label: "נדחה" },
  { id: "9",  label: "פג תוקף" },
];

const STATUS_COLORS: Record<string, string> = {
  "":   "bg-foreground text-background",
  "13": "bg-green-600 text-white",
  "6":  "bg-emerald-500 text-white",
  "4":  "bg-indigo-500 text-white",
  "5":  "bg-blue-500 text-white",
  "7":  "bg-red-500 text-white",
  "9":  "bg-orange-500 text-white",
};

const STATUS_INACTIVE: Record<string, string> = {
  "":   "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
  "13": "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/30 dark:text-green-400",
  "6":  "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400",
  "4":  "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400",
  "5":  "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400",
  "7":  "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400",
  "9":  "bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/30 dark:text-orange-400",
};

const KNESSET_OPTIONS = [
  { value: "",   label: "כל הכנסות" },
  { value: "25", label: "כנסת 25" },
  { value: "24", label: "כנסת 24" },
  { value: "23", label: "כנסת 23" },
];

interface BillFilterBarProps {
  className?: string;
}

export function BillFilterBar({ className }: BillFilterBarProps) {
  const [search, setSearch] = useQueryState("search", { defaultValue: "", shallow: false });
  const [statusId, setStatusId] = useQueryState("status_id", { defaultValue: "", shallow: false });
  const [knessetNum, setKnessetNum] = useQueryState("knesset_num", { defaultValue: "", shallow: false });

  const [localSearch, setLocalSearch] = useState(search ?? "");
  const debouncedSearch = useDebounce(localSearch, 350);

  useEffect(() => {
    setSearch(debouncedSearch || null);
  }, [debouncedSearch, setSearch]);

  const hasFilters = !!localSearch || !!statusId || !!knessetNum;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search + knesset row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="חפש הצעת חוק..."
          />
        </div>

        <select
          value={knessetNum ?? ""}
          onChange={(e) => { setKnessetNum(e.target.value || null); }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring h-10"
          aria-label="כנסת"
        >
          {KNESSET_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setLocalSearch("");
              setSearch(null);
              setStatusId(null);
              setKnessetNum(null);
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 h-10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            נקה
          </button>
        )}
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {STATUS_PILLS.map((s) => {
          const active = (statusId ?? "") === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setStatusId(s.id || null)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all duration-100",
                active ? STATUS_COLORS[s.id] : STATUS_INACTIVE[s.id]
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
