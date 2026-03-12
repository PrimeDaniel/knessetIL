"use client";

import Link from "next/link";
import { ArrowRight, Users, TrendingUp } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { useParty, usePartyCohesion } from "@/hooks/useParties";
import { formatPercent } from "@/lib/utils";

export default function PartyProfilePage({ params }: { params: { id: string } }) {
  const factionId = parseInt(params.id, 10);
  const { data: faction, isLoading, isError } = useParty(factionId);
  const { data: cohesion } = usePartyCohesion(factionId);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <div className="space-y-4">
            <SkeletonCard className="h-24" />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !faction) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center text-destructive">
            לא ניתן לטעון את פרטי הסיעה.
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const isActive = !faction.finish_date;
  const maxKnesset =
    faction.knessets.length > 0 ? Math.max(...faction.knessets) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/parties" className="hover:text-foreground flex items-center gap-1">
            <ArrowRight className="h-3.5 w-3.5" />
            סיעות
          </Link>
          <span>/</span>
          <span className="text-foreground">{faction.name}</span>
        </nav>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{faction.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {faction.member_count} חברים
              </span>
              {maxKnesset && <span>כנסת {maxKnesset}</span>}
            </div>
          </div>
          {isActive && (
            <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              פעילה
            </span>
          )}
        </div>

        {/* Knesset sessions */}
        {faction.knessets.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-1.5">
            {faction.knessets.sort((a, b) => b - a).map((k) => (
              <span
                key={k}
                className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                כנסת {k}
              </span>
            ))}
          </div>
        )}

        {/* Cohesion score */}
        <section className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            לכידות סיעתית
          </h2>
          {cohesion != null && cohesion.cohesion_score != null ? (
            <div>
              <div className="text-3xl font-bold text-primary mb-1">
                {formatPercent(cohesion.cohesion_score)}
              </div>
              <p className="text-xs text-muted-foreground">
                {cohesion.total_votes_analyzed.toLocaleString("he-IL")} הצבעות נותחו
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              נתוני לכידות אינם זמינים — נדרשת גישה לנתוני הצבעות פרטניים.
            </p>
          )}
        </section>

        {/* Members list */}
        {"members" in faction && Array.isArray((faction as any).members) && (faction as any).members.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-semibold">חברי סיעה</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(faction as any).members.map((m: { mk_individual_id: number; mk_individual_name: string; is_current: boolean }) => (
                <Link
                  key={m.mk_individual_id}
                  href={`/members/${m.mk_individual_id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent/30 transition-colors"
                >
                  <span>{m.mk_individual_name}</span>
                  {m.is_current && (
                    <span className="text-[10px] text-green-600 dark:text-green-400">נוכחי</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
