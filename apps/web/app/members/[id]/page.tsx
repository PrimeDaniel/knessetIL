"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Mail, Phone, ExternalLink } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { RebellionRateGauge } from "@/components/charts/RebellionRateGauge";
import { VotingHistoryTable } from "@/components/members/VotingHistoryTable";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { useMember, useMemberStats } from "@/hooks/useMembers";

interface StatItemProps {
  label: string;
  value: string | number;
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function MemberProfilePage({ params }: { params: { id: string } }) {
  const mkId = parseInt(params.id, 10);
  const { data: mk, isLoading, isError } = useMember(mkId);
  const { data: stats } = useMemberStats(mkId);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <div className="space-y-4">
            <SkeletonCard className="h-32" />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !mk) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center text-destructive">
            לא ניתן לטעון את פרופיל חבר הכנסת.
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/members" className="hover:text-foreground flex items-center gap-1">
            <ArrowRight className="h-3.5 w-3.5" />
            חברי כנסת
          </Link>
          <span>/</span>
          <span className="text-foreground">{mk.mk_individual_name}</span>
        </nav>

        {/* Profile header */}
        <div className="mb-6 flex items-start gap-5">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted">
            {mk.mk_individual_photo ? (
              <Image
                src={mk.mk_individual_photo}
                alt={mk.mk_individual_name}
                fill
                className="object-cover"
                sizes="80px"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                {mk.mk_individual_first_name?.[0] ?? "?"}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{mk.mk_individual_name}</h1>
              {mk.is_current && (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  כנסת נוכחית
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {mk.mk_individual_name_eng}
            </p>

            {mk.current_faction && (
              <Link
                href={`/parties/${mk.current_faction.id}`}
                className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {mk.current_faction.name}
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}

            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {mk.mk_individual_email && (
                <a href={`mailto:${mk.mk_individual_email}`} className="flex items-center gap-1 hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {mk.mk_individual_email}
                </a>
              )}
              {mk.mk_individual_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {mk.mk_individual_phone}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Knesset sessions */}
        {mk.knessets.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-1.5">
            {mk.knessets.sort((a, b) => b - a).map((k) => (
              <span
                key={k}
                className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                כנסת {k}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-semibold">סטטיסטיקות</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatItem label="הצעות חוק" value={stats.bills_proposed} />
              <StatItem label="הצבעות" value={stats.total_votes.toLocaleString("he-IL")} />
              <StatItem
                label="נוכחות"
                value={stats.attendance_rate != null ? `${Math.round(stats.attendance_rate * 100)}%` : "—"}
              />
              <StatItem
                label="מרד"
                value={stats.rebellion_rate != null ? `${Math.round(stats.rebellion_rate * 100)}%` : "—"}
              />
            </div>
          </section>
        )}

        {/* Rebellion gauge */}
        <section className="mb-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold">שיעור מרד</h2>
          <div className="flex justify-center">
            <RebellionRateGauge rate={stats?.rebellion_rate ?? null} size={160} />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            % הצבעות נגד עמדת הסיעה
          </p>
        </section>

        {/* Faction history */}
        {mk.faction_history.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-semibold">היסטוריית סיעות</h2>
            <div className="space-y-1.5">
              {mk.faction_history.map((fh, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <span className="font-medium">{fh.faction_name}</span>
                  <span className="text-xs text-muted-foreground">כנסת {fh.knesset_num}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Positions */}
        {mk.positions.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-semibold">תפקידים</h2>
            <div className="space-y-1.5">
              {mk.positions.slice(0, 10).map((pos) => (
                <div
                  key={pos.position_id}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <span className="font-medium">{pos.position_name}</span>
                  {pos.body_name && (
                    <span className="ms-2 text-muted-foreground">— {pos.body_name}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Voting history */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">היסטוריית הצבעות</h2>
          <VotingHistoryTable mkId={mkId} />
        </section>
      </main>
      <Footer />
    </div>
  );
}
