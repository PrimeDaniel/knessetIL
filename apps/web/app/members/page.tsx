"use client";

import { useQueryState } from "nuqs";
import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MKCard } from "@/components/members/MKCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { useDebounce } from "@/hooks/useDebounce";
import { useMembers } from "@/hooks/useMembers";
import { cn } from "@/lib/utils";

const IS_CURRENT_OPTIONS = [
  { value: "", label: "כל חברי הכנסת" },
  { value: "true", label: "כנסת נוכחית" },
  { value: "false", label: "לשעבר" },
];

export default function MembersPage() {
  const [search, setSearch] = useQueryState("search", { defaultValue: "", shallow: false });
  const [isCurrent, setIsCurrent] = useQueryState("is_current", { defaultValue: "", shallow: false });
  const [page, setPage] = useQueryState("page", { defaultValue: "1", shallow: false });

  const [localSearch, setLocalSearch] = useState(search ?? "");
  const debouncedSearch = useDebounce(localSearch, 350);

  useEffect(() => {
    setSearch(debouncedSearch || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const currentPage = parseInt(page ?? "1", 10);

  const { data, isLoading, isError } = useMembers({
    page: currentPage,
    limit: 30,
    search: debouncedSearch || undefined,
    is_current:
      isCurrent === "true" ? true : isCurrent === "false" ? false : undefined,
  });

  const hasFilters = !!localSearch || !!isCurrent;

  const handlePageChange = (p: number) => {
    setPage(String(p));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">חברי כנסת</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.pagination.total.toLocaleString("he-IL")} חברי כנסת
            </p>
          )}
        </div>

        {/* Filter bar */}
        <div className={cn("flex flex-wrap gap-3 items-end mb-6")}>
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              value={localSearch}
              onChange={setLocalSearch}
              placeholder="חפש חבר/ת כנסת..."
            />
          </div>

          <select
            value={isCurrent ?? ""}
            onChange={(e) => {
              setIsCurrent(e.target.value || null);
              setPage("1");
            }}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="סנן לפי מצב"
          >
            {IS_CURRENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setLocalSearch("");
                setSearch(null);
                setIsCurrent(null);
                setPage("1");
              }}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              נקה סינון
            </button>
          )}
        </div>

        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            שגיאה בטעינת נתונים. אנא נסה שוב.
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 15 }).map((_, i) => (
              <SkeletonCard key={i} className="h-[72px]" />
            ))}
          </div>
        )}

        {data && !isLoading && (
          <>
            {data.data.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                לא נמצאו חברי כנסת התואמים את החיפוש.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.data.map((mk) => (
                  <MKCard key={mk.mk_individual_id} mk={mk} />
                ))}
              </div>
            )}

            <div className="mt-8">
              <Pagination
                page={currentPage}
                totalPages={data.pagination.total_pages}
                total={data.pagination.total}
                onPageChange={handlePageChange}
              />
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
