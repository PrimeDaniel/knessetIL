"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "חיפוש...",
  className,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Icon on the right in RTL */}
      <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-input bg-background pe-10 ps-4 py-2",
          "text-sm placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "transition-colors"
        )}
        dir="rtl"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="נקה חיפוש"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
