"use client";

import Link from "next/link";
import { ArrowRight, Calendar, User2, Hash, ExternalLink } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { StatusBadge } from "@/components/shared/VoteBadge";
import { VoteBreakdownBar } from "@/components/charts/VoteBreakdownBar";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { useBill, useBillVotes } from "@/hooks/useBills";
import { formatDateHe } from "@/lib/utils";

export default function BillDetailPage({ params }: { params: { id: string } }) {
  const billId = parseInt(params.id, 10);
  const { data: bill, isLoading, isError } = useBill(billId);
  const { data: voteDetail } = useBillVotes(billId);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !bill) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center text-destructive">
            לא ניתן לטעון את הצעת החוק.
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
          <Link href="/bills" className="hover:text-foreground flex items-center gap-1">
            <ArrowRight className="h-3.5 w-3.5" />
            הצעות חוק
          </Link>
          <span>/</span>
          <span className="text-foreground truncate max-w-[200px]">{bill.name}</span>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h1 className="text-xl font-bold leading-snug flex-1">{bill.name}</h1>
            <StatusBadge status={bill.status_desc} className="shrink-0 mt-1" />
          </div>
          {bill.name_eng && (
            <p className="text-sm text-muted-foreground">{bill.name_eng}</p>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground mb-6 pb-6 border-b border-border">
          <span className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" />
            מזהה: {bill.bill_id}
          </span>
          <span className="flex items-center gap-1.5">
            כנסת {bill.knesset_num}
          </span>
          {bill.publication_date && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateHe(bill.publication_date)}
            </span>
          )}
          {bill.sub_type_desc && (
            <span className="bg-muted px-2 py-0.5 rounded-full text-xs">
              {bill.sub_type_desc}
            </span>
          )}
        </div>

        {/* Initiators */}
        {bill.initiators.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <User2 className="h-4 w-4" />
              יוזמים
            </h2>
            <div className="flex flex-wrap gap-2">
              {bill.initiators.map((init) => (
                <Link
                  key={init.mk_individual_id}
                  href={`/members/${init.mk_individual_id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs hover:bg-accent/30 transition-colors"
                >
                  {init.mk_name}
                  {init.faction_name && (
                    <span className="text-muted-foreground">({init.faction_name})</span>
                  )}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Summary */}
        {bill.summary_law && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold mb-2">סיכום</h2>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {bill.summary_law}
            </p>
          </section>
        )}

        {/* Vote result */}
        {bill.vote && (
          <section className="mb-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-4">תוצאות הצבעה</h2>
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>
                <Calendar className="inline h-3.5 w-3.5 me-1" />
                {formatDateHe(bill.vote.vote_date)}
              </span>
              <span className={bill.vote.is_accepted ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                {bill.vote.is_accepted ? "עבר" : "נדחה"}
              </span>
            </div>
            <VoteBreakdownBar
              totalFor={bill.vote.total_for}
              totalAgainst={bill.vote.total_against}
              totalAbstain={bill.vote.total_abstain}
            />
          </section>
        )}

        {/* Vote detail from /bills/{id}/votes (fallback for when bill.vote is missing) */}
        {!bill.vote && voteDetail && (
          <section className="mb-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-4">תוצאות הצבעה</h2>
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span className={voteDetail.is_accepted ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                {voteDetail.is_accepted ? "עבר" : "נדחה"}
              </span>
            </div>
            <VoteBreakdownBar
              totalFor={voteDetail.total_for}
              totalAgainst={voteDetail.total_against}
              totalAbstain={voteDetail.total_abstain}
            />
          </section>
        )}

        {/* Related bills */}
        {bill.related_bills.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold mb-3">הצעות חוק קשורות</h2>
            <div className="space-y-2">
              {bill.related_bills.map((rel) => (
                <Link
                  key={rel.bill_id}
                  href={`/bills/${rel.bill_id}`}
                  className="block rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent/30 transition-colors"
                >
                  {rel.name}
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
