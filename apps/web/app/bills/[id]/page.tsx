"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { VoteBreakdownBar } from "@/components/charts/VoteBreakdownBar";
import { FactionVotePanel } from "@/components/votes/FactionVotePanel";
import { Skeleton } from "@/components/shared/SkeletonCard";
import { useBill, useBillVotes } from "@/hooks/useBills";
import { formatDateHe, cn } from "@/lib/utils";
import {
  ChevronRight, Calendar, User2, FileText,
  CheckCircle2, XCircle, AlertCircle, Building2, Hash,
} from "lucide-react";

function statusStyle(statusId: number) {
  if (statusId === 13) return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300";
  if (statusId === 6)  return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (statusId === 4 || statusId === 5) return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300";
  if (statusId === 7 || statusId === 8 || statusId === 9) return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300";
  return "bg-muted text-muted-foreground border-border";
}

function statusAccentBar(statusId: number) {
  if (statusId === 13 || statusId === 6) return "bg-gradient-to-l from-green-500 to-emerald-400";
  if (statusId === 4 || statusId === 5)  return "bg-gradient-to-l from-blue-500 to-indigo-400";
  if (statusId === 7 || statusId === 8 || statusId === 9) return "bg-gradient-to-l from-red-500 to-rose-400";
  return "bg-gradient-to-l from-primary to-blue-400";
}

export default function BillDetailPage({ params }: { params: { id: string } }) {
  const billId = parseInt(params.id, 10);

  const { data: bill, isLoading, isError } = useBill(billId);
  const { data: voteDetail, isLoading: voteLoading } = useBillVotes(billId);

  useEffect(() => {
    if (bill?.name) {
      document.title = `${bill.name} | שקיפות הכנסת`;
    }
    return () => { document.title = "שקיפות הכנסת"; };
  }, [bill?.name]);

  if (isError) {
    return (
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-16 max-w-3xl">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">הצעת החוק לא נמצאה</p>
              <p className="text-sm mt-1 opacity-80">ייתכן שהמזהה שגוי או שהנתונים טרם נטענו.</p>
              <Link href="/bills" className="text-sm mt-3 inline-flex items-center gap-1 text-primary hover:underline">
                <ChevronRight className="h-3.5 w-3.5" />
                חזרה לרשימת הצעות החוק
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/bills" className="hover:text-foreground transition-colors flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            הצעות חוק
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          {isLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <span className="text-foreground truncate max-w-[240px]">{bill?.name}</span>
          )}
        </nav>

        {isLoading ? (
          <BillDetailSkeleton />
        ) : bill ? (
          <div className="space-y-5">
            {/* Hero card */}
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className={cn("h-1.5 w-full", statusAccentBar(bill.status_id))} />
              <div className="p-6">
                <h1 className="text-xl font-bold leading-snug text-foreground">{bill.name}</h1>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-lg border px-3 py-1 text-xs font-semibold", statusStyle(bill.status_id))}>
                    {bill.status_desc}
                  </span>
                  {bill.sub_type_desc && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />{bill.sub_type_desc}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3" />כנסת {bill.knesset_num}
                  </span>
                  {bill.publication_date && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />{formatDateHe(bill.publication_date)}
                    </span>
                  )}
                </div>
                {bill.summary_law && (
                  <div className="mt-5 pt-5 border-t border-border">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">תקציר</h2>
                    <p className="text-sm leading-relaxed text-foreground/80">{bill.summary_law}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Initiators */}
            {(bill.initiators?.length ?? 0) > 0 && (
              <section className="rounded-xl border border-border bg-card shadow-card p-5">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">יוזמים</h2>
                <div className="flex flex-wrap gap-2">
                  {bill.initiators.map((initiator) => (
                    <Link
                      key={initiator.mk_individual_id}
                      href={`/members/${initiator.mk_individual_id}`}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 hover:bg-accent hover:border-primary/20 px-3 py-2 transition-colors"
                    >
                      <User2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium leading-none">{initiator.mk_name}</p>
                        {initiator.faction_name && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{initiator.faction_name}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Vote breakdown */}
            <section className="rounded-xl border border-border bg-card shadow-card p-5">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">תוצאת הצבעה</h2>
              {voteLoading && <VoteCountingLoader />}
              {!voteLoading && voteDetail && (
                <div className="space-y-4">
                  <div className={cn(
                    "flex items-center gap-2.5 rounded-lg px-4 py-3",
                    voteDetail.is_accepted
                      ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                      : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
                  )}>
                    {voteDetail.is_accepted
                      ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                      : <XCircle className="h-5 w-5 shrink-0" />
                    }
                    <span className="font-semibold text-sm">
                      {voteDetail.is_accepted ? "ההצבעה עברה" : "ההצבעה נדחתה"}
                    </span>
                    {voteDetail.vote_date && (
                      <span className="text-xs opacity-70 ms-auto">{formatDateHe(voteDetail.vote_date)}</span>
                    )}
                  </div>
                  <VoteBreakdownBar
                    totalFor={voteDetail.total_for}
                    totalAgainst={voteDetail.total_against}
                    totalAbstain={voteDetail.total_abstain}
                  />
                  {voteDetail.party_breakdown && voteDetail.party_breakdown.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">הצבעה לפי סיעה</p>
                      <p className="text-[11px] text-muted-foreground mb-2">לחצו על סיעה כדי לראות את עמדת כל חבר כנסת</p>
                      <FactionVotePanel
                        partyBreakdown={voteDetail.party_breakdown}
                        mkVotes={voteDetail.mk_votes}
                      />
                    </div>
                  )}
                </div>
              )}
              {!voteLoading && !voteDetail && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  לא נמצאו נתוני הצבעה עבור הצעת חוק זו.
                </p>
              )}
            </section>
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

function BillDetailSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero card */}
      <div className="rounded-xl border border-primary/10 bg-card shadow-card overflow-hidden">
        <div className="h-1.5 bg-gradient-to-l from-primary/30 via-blue-400/20 to-indigo-400/30 w-full animate-pulse" />
        <div className="p-6 space-y-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-7 w-24 rounded-lg" />
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-7 w-28 rounded-lg" />
          </div>
        </div>
        <div className="px-6 pb-4 flex items-center gap-2 text-xs text-muted-foreground/50">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" />
          <span>טוען נתוני הצעת חוק</span>
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="inline-block h-1 w-1 rounded-full bg-primary/30 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
        </div>
      </div>
      {/* Initiators placeholder */}
      <div className="rounded-xl border border-border bg-card shadow-card p-5 space-y-3">
        <Skeleton className="h-3 w-12" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      {/* Vote placeholder */}
      <div className="rounded-xl border border-border bg-card shadow-card p-5 space-y-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-full rounded-full" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

function VoteCountingLoader() {
  return (
    <div className="space-y-4 py-1">
      {/* Three-segment animated bar mimicking the vote breakdown being filled in */}
      <div className="relative h-10 w-full overflow-hidden rounded-full border border-border/60 bg-muted/20">
        <div className="absolute inset-0 flex">
          <div className="h-full bg-vote-for/40 animate-pulse" style={{ width: "45%", animationDelay: "0ms" }} />
          <div className="h-full bg-vote-against/40 animate-pulse" style={{ width: "35%", animationDelay: "180ms" }} />
          <div className="h-full bg-vote-abstain/35 animate-pulse" style={{ width: "20%", animationDelay: "360ms" }} />
        </div>
        {/* RTL-aware sweeping shimmer */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="h-full w-1/3 bg-gradient-to-l from-transparent via-white/15 to-transparent animate-shimmer" />
        </div>
      </div>

      {/* "Counting votes" label + bouncing dots */}
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-vote-for/70 animate-pulse" />
          <span>סופר קולות...</span>
        </span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce"
              style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </span>
      </div>

      {/* Ghost faction rows */}
      <div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
        {[0.9, 0.65, 0.45].map((opacity, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse"
            style={{ opacity }}>
            <div className="h-3 rounded bg-muted" style={{ width: `${60 + i * 20}px` }} />
            <div className="ms-auto flex gap-4">
              <div className="h-3 w-6 rounded bg-vote-for/30" />
              <div className="h-3 w-6 rounded bg-vote-against/25" />
              <div className="h-3 w-5 rounded bg-vote-abstain/20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}