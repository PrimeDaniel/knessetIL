"use client";

import { Suspense } from "react";
import { useQueryState } from "nuqs";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FactionCard } from "@/components/parties/FactionCard";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { useParties } from "@/hooks/useParties";

const KNESSET_OPTIONS = [
  { value: "", label: "כל הכנסות" },
  { value: "25", label: "כנסת 25" },
  { value: "24", label: "כנסת 24" },
  { value: "23", label: "כנסת 23" },
];

const ACTIVE_OPTIONS = [
  { value: "", label: "כל הסיעות" },
  { value: "true", label: "פעילות" },
  { value: "false", label: "לשעבר" },
];

export default function PartiesPage() {
  // useQueryState (nuqs) relies on useSearchParams, which requires a Suspense
  // boundary for Next.js static prerendering. Keep this wrapper hook-free.
  return (
    <Suspense fallback={<PartiesPageFallback />}>
      <PartiesPageContent />
    </Suspense>
  );
}

function PartiesPageFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function PartiesPageContent() {
  const [knessetNum, setKnessetNum] = useQueryState("knesset_num", {
    defaultValue: "",
    shallow: false,
  });
  const [isActive, setIsActive] = useQueryState("is_active", {
    defaultValue: "",
    shallow: false,
  });

  const { data, isLoading, isError } = useParties({
    knesset_num: knessetNum ? Number(knessetNum) : undefined,
    is_active:
      isActive === "true" ? true : isActive === "false" ? false : undefined,
  });

  const hasFilters = !!knessetNum || !!isActive;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6 animate-fade-up">
          <h1 className="text-2xl font-bold mb-1">סיעות</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.pagination.total.toLocaleString("he-IL")} סיעות
            </p>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-end mb-6">
          <select
            value={knessetNum ?? ""}
            onChange={(e) => setKnessetNum(e.target.value || null)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="כנסת"
          >
            {KNESSET_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>

          <select
            value={isActive ?? ""}
            onChange={(e) => setIsActive(e.target.value || null)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="מצב פעילות"
          >
            {ACTIVE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setKnessetNum(null);
                setIsActive(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              נקה סינון
            </button>
          )}
        </div>

        {isError && <ErrorState />}

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {data && !isLoading && (
          <>
            {data.data.length === 0 ? (
              <EmptyState message="לא נמצאו סיעות." className="py-16" />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.data.map((faction, i) => (
                  <div key={faction.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                    <FactionCard faction={faction} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
