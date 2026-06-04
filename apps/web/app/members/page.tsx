"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MKCard } from "@/components/members/MKCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { useMembers } from "@/hooks/useMembers";
import { useDebounce } from "@/hooks/useDebounce";
import { getPartyColor } from "@/lib/knesset-parties";
import { cn } from "@/lib/utils";
import { Users, ChevronLeft } from "lucide-react";
import type { MKProfile } from "@knesset/types";

type BlocFilter = "coalition" | "opposition" | null;

function groupByFaction(members: MKProfile[]): [string, MKProfile[]][] {
  const map = new Map<string, MKProfile[]>();
  for (const mk of members) {
    const key = mk.current_faction?.name ?? "ללא סיעה";
    const group = map.get(key) ?? [];
    group.push(mk);
    map.set(key, group);
  }
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
}

function BlocCard({
  label,
  count,
  factionCount,
  active,
  variant,
  onClick,
  disabled,
}: {
  label: string;
  count: number;
  factionCount: number;
  active: boolean;
  variant: "coalition" | "opposition";
  onClick: () => void;
  disabled: boolean;
}) {
  const isCoalition = variant === "coalition";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative rounded-xl border-2 p-4 text-start transition-all duration-200 w-full",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        !disabled && "cursor-pointer",
        active && isCoalition &&
          "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40 shadow-md",
        active && !isCoalition &&
          "border-orange-500 bg-orange-50 dark:border-orange-400 dark:bg-orange-950/40 shadow-md",
        !active && isCoalition &&
          "border-border bg-card hover:border-blue-300 hover:bg-blue-50/40 dark:hover:bg-blue-950/20",
        !active && !isCoalition &&
          "border-border bg-card hover:border-orange-300 hover:bg-orange-50/40 dark:hover:bg-orange-950/20",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <div
        className={cn(
          "text-3xl font-extrabold leading-none mb-1",
          isCoalition
            ? "text-blue-700 dark:text-blue-400"
            : "text-orange-700 dark:text-orange-400",
        )}
      >
        {count}
      </div>
      <div className="text-sm font-bold text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{factionCount} סיעות</div>
      {active && (
        <span
          className={cn(
            "absolute top-2 end-2 text-[10px] font-semibold rounded-full px-1.5 py-0.5",
            isCoalition
              ? "bg-blue-500 text-white"
              : "bg-orange-500 text-white",
          )}
        >
          מסונן
        </span>
      )}
    </button>
  );
}

export default function MembersPage() {
  const [localSearch, setLocalSearch] = useState("");
  const [activeBloc, setActiveBloc] = useState<BlocFilter>(null);
  const debouncedSearch = useDebounce(localSearch, 200);

  const { data, isLoading, isError } = useMembers({
    limit: 200,
    is_current: true,
  });

  const allMembers = data?.data ?? [];

  const coalitionMembers = useMemo(
    () => allMembers.filter((m) => m.is_coalition === true),
    [allMembers],
  );
  const oppositionMembers = useMemo(
    () => allMembers.filter((m) => m.is_coalition === false),
    [allMembers],
  );

  const coalitionFactions = useMemo(
    () => new Set(coalitionMembers.map((m) => m.current_faction?.name).filter(Boolean)),
    [coalitionMembers],
  );
  const oppositionFactions = useMemo(
    () => new Set(oppositionMembers.map((m) => m.current_faction?.name).filter(Boolean)),
    [oppositionMembers],
  );

  const filtered = useMemo(() => {
    let result = allMembers;
    if (activeBloc === "coalition") result = coalitionMembers;
    if (activeBloc === "opposition") result = oppositionMembers;
    if (debouncedSearch.trim()) {
      const s = debouncedSearch.trim().toLowerCase();
      result = result.filter(
        (mk) =>
          mk.mk_individual_name.toLowerCase().includes(s) ||
          mk.mk_individual_first_name?.toLowerCase().includes(s),
      );
    }
    return result;
  }, [allMembers, coalitionMembers, oppositionMembers, activeBloc, debouncedSearch]);

  const groups = useMemo(() => groupByFaction(filtered), [filtered]);

  function toggleBloc(bloc: "coalition" | "opposition") {
    setActiveBloc((prev) => (prev === bloc ? null : bloc));
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">

        {/* Page header */}
        <div className="mb-6 flex items-start justify-between gap-4 animate-fade-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold">חברי כנסת 25</h1>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {allMembers.length} חברי כנסת נוכחיים
              </p>
            )}
          </div>
        </div>

        {/* Bloc filter cards */}
        {isLoading ? (
          <div className="mb-8 grid grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="mb-8 grid grid-cols-2 gap-4 animate-fade-up">
            <BlocCard
              label="קואליציה"
              count={coalitionMembers.length}
              factionCount={coalitionFactions.size}
              active={activeBloc === "coalition"}
              variant="coalition"
              onClick={() => toggleBloc("coalition")}
              disabled={coalitionMembers.length === 0}
            />
            <BlocCard
              label="אופוזיציה"
              count={oppositionMembers.length}
              factionCount={oppositionFactions.size}
              active={activeBloc === "opposition"}
              variant="opposition"
              onClick={() => toggleBloc("opposition")}
              disabled={oppositionMembers.length === 0}
            />
          </div>
        )}

        {/* Search */}
        <div className="mb-8 max-w-sm">
          <SearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="חפש חבר/ת כנסת..."
          />
        </div>

        {isError && <ErrorState className="mb-6" />}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-8">
            {[1, 2, 3].map((g) => (
              <div key={g}>
                <div className="h-5 w-32 bg-muted rounded animate-pulse mb-3" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: g === 1 ? 6 : g === 2 ? 4 : 3 }).map((_, i) => (
                    <SkeletonCard key={i} className="h-[72px]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results grouped by faction */}
        {!isLoading && (
          <>
            {filtered.length === 0 && (
              <EmptyState message="לא נמצאו חברי כנסת התואמים את החיפוש." className="py-16" />
            )}

            {filtered.length > 0 && (
              <p className="text-xs text-muted-foreground mb-4">
                {activeBloc === "coalition" && `מציג ${filtered.length} חברי קואליציה · `}
                {activeBloc === "opposition" && `מציג ${filtered.length} חברי אופוזיציה · `}
                {!activeBloc && debouncedSearch && `נמצאו ${filtered.length} חברי כנסת · `}
                {groups.length} סיעות
              </p>
            )}

            <div className="space-y-10">
              {groups.map(([factionName, members]) => {
                return (
                  <section key={factionName}>
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className="w-1.5 h-5 rounded-full flex-shrink-0"
                        style={{ background: getPartyColor(factionName) }}
                      />
                      <h2 className="text-base font-bold text-foreground">
                        {factionName}
                      </h2>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium">
                        {members.length}
                      </span>
                      {members[0]?.current_faction?.id && (
                        <Link
                          href={`/parties/${members[0].current_faction.id}`}
                          className="ms-auto text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          דף הסיעה
                          <ChevronLeft className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {members.map((mk, i) => (
                        <div
                          key={mk.mk_individual_id}
                          className="animate-fade-up"
                          style={{ animationDelay: `${i * 20}ms` }}
                        >
                          <MKCard mk={mk} />
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
