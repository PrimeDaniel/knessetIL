"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { VoteBreakdownBar } from "@/components/charts/VoteBreakdownBar";
import { FactionVotePanel } from "@/components/votes/FactionVotePanel";
import { Skeleton } from "@/components/shared/SkeletonCard";
import { AiExplanation } from "@/components/shared/AiExplanation";
import { voteTypeToTermKey } from "@/lib/static-explanations";
import { useVoteDetail } from "@/hooks/useVotes";
import { formatDateHe, cn } from "@/lib/utils";
import { notFound } from "next/navigation";
import {
  Vote, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, Calendar, Hash,
} from "lucide-react";

export default function VoteDetailPage({ params }: { params: { id: string } }) {
  const voteId = parseInt(params.id, 10);
  if (isNaN(voteId)) notFound();
  const { data: vote, isLoading, isError } = useVoteDetail(voteId);

  if (isError) {
    return (
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-16 max-w-3xl">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">ההצבעה לא נמצאה</p>
              <p className="text-sm mt-1 opacity-80">ייתכן שהמזהה שגוי או שהנתונים טרם נטענו.</p>
              <Link href="/votes" className="text-sm mt-3 inline-flex items-center gap-1 text-primary hover:underline">
                <ChevronRight className="h-3.5 w-3.5" />
                חזרה לרשימת ההצבעות
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const total = vote ? vote.total_for + vote.total_against + vote.total_abstain || 1 : 1;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/votes" className="hover:text-foreground transition-colors flex items-center gap-1">
            <Vote className="h-3.5 w-3.5" />
            הצבעות
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          {isLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <span className="text-foreground truncate max-w-[240px]">הצבעה #{voteId}</span>
          )}
        </nav>

        {isLoading ? (
          <VoteDetailSkeleton />
        ) : vote ? (
          <div className="space-y-5">
            {/* Hero card */}
            <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
              <div className={cn("h-1.5 w-full", vote.is_accepted ? "bg-gradient-to-l from-green-500 to-emerald-400" : "bg-gradient-to-l from-red-500 to-rose-400")} />
              <div className="p-6">
                {/* Session context (broader bill title) */}
                {vote.sess_item_dscr && vote.sess_item_dscr !== vote.vote_item_dscr && (
                  <p className="text-xs text-muted-foreground mb-2 font-medium">{vote.sess_item_dscr}</p>
                )}
                <h1 className="text-xl font-bold leading-snug text-foreground">{vote.vote_item_dscr || "הצבעה ללא כותרת"}</h1>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold",
                    vote.is_accepted
                      ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300"
                  )}>
                    {vote.is_accepted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {vote.is_accepted ? "ההצבעה עברה" : "ההצבעה נדחתה"}
                  </span>
                  {vote.vote_date && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />{formatDateHe(vote.vote_date)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3" />כנסת {vote.knesset_num}
                  </span>
                </div>
              </div>
            </div>

            {/* AI explanation — this specific vote, then (if known) what its type means */}
            <AiExplanation subjectType="vote" subjectId={voteId} />
            {voteTypeToTermKey(vote.vote_item_dscr) && (
              <AiExplanation term={voteTypeToTermKey(vote.vote_item_dscr)!} />
            )}

            {/* Overall breakdown */}
            <section className="rounded-xl border border-border bg-card shadow-card p-5">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">תוצאת ההצבעה</h2>
              <VoteBreakdownBar
                totalFor={vote.total_for}
                totalAgainst={vote.total_against}
                totalAbstain={vote.total_abstain}
                showLabels
              />
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Tile label="בעד" count={vote.total_for} total={total} colorClass="text-vote-for bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" />
                <Tile label="נגד" count={vote.total_against} total={total} colorClass="text-vote-against bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" />
                <Tile label="נמנע" count={vote.total_abstain} total={total} colorClass="text-vote-abstain bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800" />
              </div>
            </section>

            {/* Faction + per-MK breakdown */}
            {vote.party_breakdown.length > 0 && (
              <section className="rounded-xl border border-border bg-card shadow-card p-5">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">הצבעה לפי סיעה</h2>
                <p className="text-xs text-muted-foreground mb-3">לחצו על סיעה כדי לראות את עמדת כל חבר כנסת</p>
                <FactionVotePanel
                  partyBreakdown={vote.party_breakdown}
                  mkVotes={vote.mk_votes}
                />
              </section>
            )}
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

function Tile({ label, count, total, colorClass }: { label: string; count: number; total: number; colorClass: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-center", colorClass)}>
      <p className="text-lg font-bold tabular-nums leading-none">{pct}%</p>
      <p className="text-[11px] font-medium mt-1">{count.toLocaleString("he-IL")} {label}</p>
    </div>
  );
}

function VoteDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="h-1.5 bg-muted w-full" />
        <div className="p-6 space-y-4">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-7 w-28 rounded-lg" />
            <Skeleton className="h-7 w-24 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card shadow-card p-5 space-y-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card shadow-card p-5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}
