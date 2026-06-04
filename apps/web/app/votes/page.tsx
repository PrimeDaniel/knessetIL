"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Pagination } from "@/components/shared/Pagination";
import { SkeletonList } from "@/components/shared/SkeletonCard";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { VoteBreakdownBar } from "@/components/charts/VoteBreakdownBar";
import { FactionVotePanel } from "@/components/votes/FactionVotePanel";
import { useVotes, useVoteDetail } from "@/hooks/useVotes";
import { UpdatingNotice } from "@/components/shared/UpdatingNotice";
import { formatDateHe, cn } from "@/lib/utils";
import type { VoteResult } from "@knesset/types";
import {
  Vote, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Loader2, ExternalLink,
} from "lucide-react";

export default function VotesPage() {
  // useQueryState (nuqs) relies on useSearchParams, which requires a Suspense
  // boundary for Next.js static prerendering. Keep this wrapper hook-free.
  return (
    <Suspense fallback={<VotesPageFallback />}>
      <VotesPageContent />
    </Suspense>
  );
}

function VotesPageFallback() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <SkeletonList rows={12} />
      </main>
      <Footer />
    </div>
  );
}

function VotesPageContent() {
  const [isAccepted, setIsAccepted] = useQueryState("is_accepted", { defaultValue: "" });
  const [page, setPage] = useQueryState("page", { defaultValue: "1", shallow: false });

  const currentPage = parseInt(page ?? "1", 10);

  const { data, isLoading, isError } = useVotes({
    page: currentPage,
    limit: 20,
    is_accepted: isAccepted === "true" ? true : isAccepted === "false" ? false : undefined,
  });

  const handlePageChange = (p: number) => {
    setPage(String(p));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6 flex items-end justify-between gap-4 animate-fade-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Vote className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold">הצבעות הכנסת</h1>
            </div>
            {data && (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  {data.pagination.total.toLocaleString("he-IL")} הצבעות
                </p>
                {data.updating && <UpdatingNotice />}
              </div>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 text-xs">
            <FilterChip
              label="הכל"
              active={!isAccepted}
              onClick={() => { setIsAccepted(""); setPage("1"); }}
            />
            <FilterChip
              label="עברו"
              active={isAccepted === "true"}
              onClick={() => { setIsAccepted("true"); setPage("1"); }}
              colorClass="text-vote-for"
            />
            <FilterChip
              label="נדחו"
              active={isAccepted === "false"}
              onClick={() => { setIsAccepted("false"); setPage("1"); }}
              colorClass="text-vote-against"
            />
          </div>
        </div>

        {isError && <ErrorState className="mb-4" />}

        {isLoading && <SkeletonList rows={12} />}

        {data && !isLoading && (
          <>
            {data.data.length === 0 ? (
              <EmptyState icon={Vote} message="לא נמצאו הצבעות." />
            ) : (
              <div className="flex flex-col gap-3">
                {data.data.map((vote, i) => (
                  <VoteListCard key={vote.id} vote={vote} index={i} />
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

function FilterChip({
  label,
  active,
  onClick,
  colorClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  colorClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 border font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : cn("border-border bg-card hover:bg-accent text-muted-foreground", colorClass)
      )}
    >
      {label}
    </button>
  );
}

function VoteListCard({ vote, index = 0 }: { vote: VoteResult; index?: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading: detailLoading } = useVoteDetail(vote.id, expanded);

  const title =
    vote.sess_item_dscr && vote.sess_item_dscr.trim().length > vote.vote_item_dscr.trim().length
      ? vote.sess_item_dscr
      : vote.vote_item_dscr || "הצבעה ללא כותרת";

  const subtitle =
    vote.sess_item_dscr &&
    vote.sess_item_dscr.trim() !== vote.vote_item_dscr.trim() &&
    vote.vote_item_dscr
      ? vote.vote_item_dscr
      : null;

  const total = vote.total_for + vote.total_against + vote.total_abstain || 1;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-card overflow-hidden transition-all animate-fade-up",
        expanded ? "border-primary/30 shadow-card-md" : "border-border hover:border-primary/20 hover:shadow-card-md"
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className={cn("h-1 w-full", vote.is_accepted ? "bg-gradient-to-l from-green-500 to-emerald-400" : "bg-gradient-to-l from-red-500 to-rose-400")} />

      <button
        type="button"
        className="w-full text-start p-4 focus:outline-none"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            "mt-0.5 shrink-0 rounded-full p-1.5",
            vote.is_accepted
              ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          )}>
            {vote.is_accepted ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{subtitle}</p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{formatDateHe(vote.vote_date)}</span>
              <span className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                vote.is_accepted
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}>
                {vote.is_accepted ? "עבר" : "נדחה"}
              </span>
            </div>

            <div className="mt-2">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border/60">
                {vote.total_for > 0 && (
                  <div style={{ width: `${(vote.total_for / total) * 100}%` }} className="bg-vote-for" />
                )}
                {vote.total_against > 0 && (
                  <div style={{ width: `${(vote.total_against / total) * 100}%` }} className="bg-vote-against" />
                )}
                {vote.total_abstain > 0 && (
                  <div style={{ width: `${(vote.total_abstain / total) * 100}%` }} className="bg-vote-abstain" />
                )}
              </div>
              <div className="flex gap-3 mt-1 text-[11px]">
                <span className="text-vote-for font-semibold">{vote.total_for} בעד</span>
                <span className="text-vote-against font-semibold">{vote.total_against} נגד</span>
                {vote.total_abstain > 0 && (
                  <span className="text-vote-abstain font-semibold">{vote.total_abstain} נמנע</span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center gap-2">
            <Link
              href={`/votes/${vote.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground/40 hover:text-primary transition-colors"
              title="פרטים מלאים"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <div className="text-muted-foreground/50">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/30 px-4 py-4 space-y-4 animate-fade-up">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">פירוט ההצבעה</p>
            <VoteBreakdownBar
              totalFor={vote.total_for}
              totalAgainst={vote.total_against}
              totalAbstain={vote.total_abstain}
              showLabels
            />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">הצבעה לפי סיעה</p>
            {detailLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>טוען נתוני סיעות...</span>
              </div>
            )}
            {!detailLoading && detail && detail.party_breakdown.length > 0 && (
              <FactionVotePanel
                partyBreakdown={detail.party_breakdown}
                mkVotes={detail.mk_votes}
              />
            )}
            {!detailLoading && detail && detail.party_breakdown.length === 0 && (
              <p className="text-xs text-muted-foreground">לא נמצאו נתוני סיעות עבור הצבעה זו.</p>
            )}
          </div>

          <div className="text-end">
            <Link
              href={`/votes/${vote.id}`}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              לדף ההצבעה המלא
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
