"use client";

/**
 * BillFilterBar — search + status filter + knesset session selector.
 * Phase 4: All state lives in URL via nuqs (shareable, back-button safe).
 */
import { useQueryState } from "nuqs";
import { SearchInput } from "@/components/shared/SearchInput";
import { useDebounce } from "@/hooks/useDebounce";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Knesset bill status options (from STATUS_MAP in bills_service.py)
const STATUS_OPTIONS = [
  { id: "",  label: "כל הסטטוסים" },
  { id: "4", label: "קריאה ראשונה" },
  { id: "5", label: "בוועדה" },
  { id: "6", label: "עבר" },
  { id: "7", label: "נדחה" },
  { id: "9", label: "פג תוקף" },
  { id: "13", label: "הפך לחוק" },
];

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

  // Local input state for debouncing — avoids URL update on every keystroke
  const [localSearch, setLocalSearch] = useState(search ?? "");
  const debouncedSearch = useDebounce(localSearch, 350);

  useEffect(() => {
    setSearch(debouncedSearch || null);
  }, [debouncedSearch, setSearch]);

  const hasFilters = !!localSearch || !!statusId || !!knessetNum;

  return (
    <div className={cn("flex flex-wrap gap-3 items-end", className)}>
      <div className="flex-1 min-w-[200px]">
        <SearchInput
          value={localSearch}
          onChange={setLocalSearch}
          placeholder="חפש הצעת חוק..."
        />
      </div>

      <select
        value={statusId ?? ""}
        onChange={(e) => setStatusId(e.target.value || null)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="סנן לפי סטטוס"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      <select
        value={knessetNum ?? ""}
        onChange={(e) => setKnessetNum(e.target.value || null)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          נקה סינון
        </button>
      )}
    </div>
  );
}
