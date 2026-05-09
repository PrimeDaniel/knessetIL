"use client";

import Link from "next/link";
import { useDashboard } from "@/hooks/useParties";
import { StatCard } from "@/components/shared/StatCard";
import { Skeleton, SkeletonCard } from "@/components/shared/SkeletonCard";
import { VoteBreakdownBar } from "@/components/charts/VoteBreakdownBar";
import { formatDateHe } from "@/lib/utils";
import {
  CheckCircle2, XCircle, FileText, Users, Scale,
  ChevronLeft, BarChart3, TrendingUp, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function HomeDashboard() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <div className="space-y-10 animate-pulse">
        <HeroSection loading />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <Scale className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-muted-foreground">שגיאה בטעינת הנתונים. ודאו שהשרת פועל.</p>
        <Link href="/bills" className="text-sm text-primary hover:underline">
          עיין בהצעות החוק ←
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <HeroSection />

      {/* Stats */}
      <section>
        <SectionHeader icon={BarChart3} title={`סטטיסטיקות — כנסת ${data.knesset_num}`} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <StatCard label="הצבעות השנה" value={data.total_votes_this_knesset} />
          <StatCard label="עברו" value={data.total_votes_accepted} accent="for" icon={CheckCircle2} />
          <StatCard label="נדחו" value={data.total_votes_rejected} accent="against" icon={XCircle} />
          <StatCard label="הצעות חוק" value={data.total_bills} />
        </div>
      </section>

      {/* Recent votes */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={TrendingUp} title="הצבעות אחרונות" />
          <Link href="/bills" className="text-sm text-primary hover:underline flex items-center gap-1">
            <span>כל הצעות החוק</span>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {data.recent_votes.slice(0, 8).map((vote) => (
            <div
              key={vote.vote_id}
              className="group rounded-xl border border-border bg-card shadow-card hover:shadow-card-md hover:border-primary/20 transition-all p-4"
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "mt-0.5 shrink-0 rounded-full p-1",
                  vote.is_accepted
                    ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {vote.is_accepted
                    ? <CheckCircle2 className="h-4 w-4" />
                    : <XCircle className="h-4 w-4" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
                    {vote.vote_item_dscr || "הצבעה ללא כותרת"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDateHe(vote.vote_date)}
                  </p>

                  {/* Inline mini vote bar */}
                  <div className="mt-2.5">
                    <VoteBreakdownBar
                      totalFor={vote.total_for}
                      totalAgainst={vote.total_against}
                      totalAbstain={vote.total_abstain}
                      showLabels={false}
                      compact
                    />
                    <div className="mt-1.5 flex gap-4 text-[11px]">
                      <span className="text-vote-for font-medium">בעד {vote.total_for}</span>
                      <span className="text-vote-against font-medium">נגד {vote.total_against}</span>
                      {vote.total_abstain > 0 && (
                        <span className="text-vote-abstain font-medium">נמנע {vote.total_abstain}</span>
                      )}
                    </div>
                  </div>
                </div>

                <span className={cn(
                  "shrink-0 self-start text-xs font-semibold px-2 py-1 rounded-full",
                  vote.is_accepted
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {vote.is_accepted ? "עבר" : "נדחה"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent bills */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={FileText} title="הצעות חוק אחרונות" />
          <Link href="/bills" className="text-sm text-primary hover:underline flex items-center gap-1">
            <span>כל הצעות החוק</span>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {data.recent_bills.slice(0, 6).map((bill) => (
            <Link
              key={bill.bill_id}
              href={`/bills/${bill.bill_id}`}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card shadow-card hover:shadow-card-md hover:border-primary/20 transition-all p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {bill.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {bill.status_desc}
                  {bill.publication_date && ` · ${formatDateHe(bill.publication_date)}`}
                </p>
              </div>
              <ArrowLeft className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/50 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroSection({ loading }: { loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="h-1.5 bg-gradient-to-l from-primary via-blue-400 to-indigo-500 w-full" />
      <div className="p-8 md:p-10">
        <div className="flex items-center gap-3 mb-3">
          <Scale className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">שקיפות הכנסת</h1>
        </div>
        <p className="text-muted-foreground text-lg leading-relaxed max-w-xl">
          עקבו אחרי הצבעות, הצעות חוק וחברי כנסת — נתוני הכנסת בשקיפות מלאה
        </p>
        {!loading && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/bills"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors shadow-card"
            >
              <FileText className="h-4 w-4" />
              הצעות חוק
            </Link>
            <Link
              href="/members"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background text-foreground px-5 py-2.5 text-sm font-semibold hover:bg-accent transition-colors shadow-card"
            >
              <Users className="h-4 w-4" />
              חברי כנסת
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
    </div>
  );
}
