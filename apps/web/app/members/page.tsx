"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MKCard } from "@/components/members/MKCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { useMembers } from "@/hooks/useMembers";
import { useDebounce } from "@/hooks/useDebounce";
import { Users, ChevronLeft } from "lucide-react";
import type { MKProfile } from "@knesset/types";

function groupByFaction(members: MKProfile[]): [string, MKProfile[]][] {
  const map = new Map<string, MKProfile[]>();
  for (const mk of members) {
    const key = mk.current_faction?.name ?? "ללא סיעה";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(mk);
  }
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
}

export default function MembersPage() {
  const [localSearch, setLocalSearch] = useState("");
  const debouncedSearch = useDebounce(localSearch, 200);

  // Fetch all current K25 members in one shot — 120-130 total, no pagination needed
  const { data, isLoading, isError } = useMembers({
    limit: 200,
    is_current: true,
  });

  const allMembers = data?.data ?? [];

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return allMembers;
    const s = debouncedSearch.trim().toLowerCase();
    return allMembers.filter((mk) =>
      mk.mk_individual_name.toLowerCase().includes(s) ||
      mk.mk_individual_first_name?.toLowerCase().includes(s)
    );
  }, [allMembers, debouncedSearch]);

  const groups = useMemo(() => groupByFaction(filtered), [filtered]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">

        {/* Page header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold">חברי כנסת 25</h1>
            </div>
            {data && (
              <p className="text-sm text-muted-foreground">
                {allMembers.length} חברי כנסת נוכחיים ·{" "}
                {groups.length} סיעות
              </p>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-8 max-w-sm">
          <SearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="חפש חבר/ת כנסת..."
          />
        </div>

        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive mb-6">
            שגיאה בטעינת נתונים. אנא נסה שוב.
          </div>
        )}

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
              <div className="py-16 text-center text-muted-foreground">
                לא נמצאו חברי כנסת התואמים את החיפוש.
              </div>
            )}

            <div className="space-y-10">
              {groups.map(([factionName, members]) => (
                <section key={factionName}>
                  <div className="flex items-center gap-3 mb-3">
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
                    {members.map((mk) => (
                      <MKCard key={mk.mk_individual_id} mk={mk} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
