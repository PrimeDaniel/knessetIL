"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDashboard } from "@/hooks/useParties";
import { useVoteDetail } from "@/hooks/useVotes";
import { BillModal } from "@/components/bills/BillModal";
import { FactionVotePanel } from "@/components/votes/FactionVotePanel";
import { StatCard } from "@/components/shared/StatCard";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { UpdatingNotice } from "@/components/shared/UpdatingNotice";
import { VoteBreakdownBar } from "@/components/charts/VoteBreakdownBar";
import { AiExplanation } from "@/components/shared/AiExplanation";
import { voteTypeToTermKey } from "@/lib/static-explanations";
import { formatDateHe } from "@/lib/utils";
import type { RecentVote } from "@knesset/types";
import {
  CheckCircle2, XCircle, FileText, Scale,
  ChevronLeft, ChevronRight, BarChart3, TrendingUp, ArrowLeft,
  Vote, X, ExternalLink, Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";

const VOTE_TYPE_META: Record<string, { label: string; color: string }> = {
  "הסתייגות":           { label: "הסתייגות",         color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  "קריאה שניה ושלישית": { label: "ק׳ שנייה ושלישית", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "קריאה ראשונה":       { label: "קריאה ראשונה",     color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  "הצבעת אי-אמון":     { label: "אי-אמון",           color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
  "אישור":              { label: "אישור",             color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
};

function getVoteTypeMeta(dscr: string) {
  if (!dscr) return { label: "הצבעה", color: "bg-muted text-muted-foreground" };
  const exact = VOTE_TYPE_META[dscr.trim()];
  if (exact) return exact;
  for (const [key, val] of Object.entries(VOTE_TYPE_META)) {
    if (dscr.includes(key)) return val;
  }
  return { label: dscr.length <= 20 ? dscr : "הצבעה", color: "bg-muted text-muted-foreground" };
}

function primaryTitleFor(vote: RecentVote) {
  return vote.sess_item_dscr && vote.sess_item_dscr.trim().length > (vote.vote_item_dscr || "").trim().length
    ? vote.sess_item_dscr
    : vote.vote_item_dscr || "הצבעה ללא כותרת";
}

// ─── Shared modal chrome helpers ─────────────────────────────────────────────

function ModalBackdrop({ onClose }: { onClose: () => void }) {
  return <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-backdrop-in" onClick={onClose} />;
}

function ModalBackButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
      aria-label="חזרה"
    >
      <ChevronRight className="h-4 w-4" />
      <span>חזרה</span>
    </button>
  );
}

// ─── HomeDashboard ────────────────────────────────────────────────────────────

export function HomeDashboard() {
  const { data, isLoading, error } = useDashboard();
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [selectedVote, setSelectedVote] = useState<RecentVote | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-10 animate-pulse">
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
      {/* Stats */}
      <section>
        <div className="flex items-center justify-between">
          <SectionHeader icon={BarChart3} title={`סטטיסטיקות — כנסת ${data.knesset_num}`} />
          {data.updating && <UpdatingNotice />}
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          {[
            { label: "הצבעות", value: data.total_votes_this_knesset, icon: Vote },
            { label: "הצעות חוק", value: data.total_bills, icon: FileText },
            { label: "הפכו לחוק", value: data.bills_passed_into_law, icon: Gavel },
          ].map((card, i) => (
            <div key={card.label} className="animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <StatCard label={card.label} value={card.value} icon={card.icon} />
            </div>
          ))}
        </div>
      </section>

      {/* Main Grid: Votes and Bills side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Recent votes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeader icon={TrendingUp} title="הצבעות אחרונות" />
            <Link href="/votes" className="text-sm text-primary hover:underline flex items-center gap-1">
              <span>כל ההצבעות</span>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {data.recent_votes.slice(0, 8).map((vote, i) => (
              <div key={vote.vote_id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                <VoteCard vote={vote} onSelect={setSelectedVote} />
              </div>
            ))}
          </div>
        </section>

        {/* Recent bills */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeader icon={FileText} title="הצעות חוק אחרונות" />
            <Link href="/bills" className="text-sm text-primary hover:underline flex items-center gap-1">
              <span>כל הצעות החוק</span>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {data.recent_bills.slice(0, 8).map((bill, i) => (
              <button
                key={bill.bill_id}
                type="button"
                onClick={() => setSelectedBillId(bill.bill_id)}
                className="group w-full text-start flex items-center gap-3 rounded-xl border border-border bg-card shadow-card hover:shadow-card-md hover:border-primary/20 hover:-translate-y-px transition-all p-4 animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {bill.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {bill.status_desc}
                    {bill.publication_date && ` · ${formatDateHe(bill.publication_date)}`}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/50 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {selectedVote && (
        <VoteModal vote={selectedVote} onClose={() => setSelectedVote(null)} />
      )}
      {selectedBillId && (
        <BillModal billId={selectedBillId} onClose={() => setSelectedBillId(null)} />
      )}
    </div>
  );
}

// ─── VoteCard (click-to-modal, no inline expand) ──────────────────────────────

function VoteCard({ vote, onSelect }: { vote: RecentVote; onSelect: (v: RecentVote) => void }) {
  const typeMeta = getVoteTypeMeta(vote.vote_item_dscr || "");
  const title = primaryTitleFor(vote);
  const total = vote.total_for + vote.total_against + vote.total_abstain || 1;

  return (
    <button
      type="button"
      onClick={() => onSelect(vote)}
      className="w-full text-start rounded-xl border border-border bg-card shadow-card hover:border-primary/20 hover:shadow-card-md transition-all overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {/* Accent bar */}
      <div className={cn(
        "h-1 w-full",
        vote.is_accepted
          ? "bg-gradient-to-l from-green-500 to-emerald-400"
          : "bg-gradient-to-l from-red-500 to-rose-400"
      )} />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Result icon */}
          <div className={cn(
            "mt-0.5 shrink-0 rounded-full p-1.5",
            vote.is_accepted
              ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          )}>
            {vote.is_accepted ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary">
              {title}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", typeMeta.color)}>
                <Vote className="h-2.5 w-2.5 ml-1" />
                {typeMeta.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{formatDateHe(vote.vote_date)}</span>
              {vote.session_num > 0 && (
                <span className="text-[11px] text-muted-foreground">· ישיבה {vote.session_num}</span>
              )}
            </div>

            {/* Compact bar + counts */}
            <div className="mt-2.5 space-y-1">
              <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/60">
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
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-vote-for" />
                  <span className="font-semibold text-vote-for">{vote.total_for}</span>
                  <span className="text-muted-foreground">בעד</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-vote-against" />
                  <span className="font-semibold text-vote-against">{vote.total_against}</span>
                  <span className="text-muted-foreground">נגד</span>
                </span>
                {vote.total_abstain > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-vote-abstain" />
                    <span className="font-semibold text-vote-abstain">{vote.total_abstain}</span>
                    <span className="text-muted-foreground">נמנע</span>
                  </span>
                )}
                <span className={cn(
                  "ms-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  vote.is_accepted
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                )}>
                  {vote.is_accepted ? "עבר" : "נדחה"}
                </span>
              </div>
            </div>
          </div>

          <ExternalLink className="h-4 w-4 text-muted-foreground/30 shrink-0 mt-1" />
        </div>
      </div>
    </button>
  );
}

// ─── VoteModal ────────────────────────────────────────────────────────────────

function VoteModal({ vote, onClose }: { vote: RecentVote; onClose: () => void }) {
  const { data: detail, isLoading } = useVoteDetail(vote.vote_id, true);
  const handleClose = useCallback(() => onClose(), [onClose]);
  const title = primaryTitleFor(vote);
  const typeMeta = getVoteTypeMeta(vote.vote_item_dscr || "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <ModalBackdrop onClose={handleClose} />

      <div
        className="relative z-10 w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[82vh] bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-modal-in"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Accent bar */}
        <div className={cn(
          "h-1.5 shrink-0",
          vote.is_accepted
            ? "bg-gradient-to-l from-green-500 via-emerald-400 to-teal-400"
            : "bg-gradient-to-l from-red-500 via-rose-400 to-pink-400"
        )} />

        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-4 border-b border-border shrink-0">
          <ModalBackButton onClose={handleClose} />
          <div className="flex-1 min-w-0 text-center">
            <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{title}</p>
            <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", typeMeta.color)}>
                <Vote className="h-2.5 w-2.5 ml-1" />
                {typeMeta.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{formatDateHe(vote.vote_date)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-full p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {isLoading ? (
            <VoteModalSkeleton />
          ) : detail ? (
            <VoteModalContent vote={vote} detail={detail} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">לא נמצאו נתונים</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 shrink-0 bg-muted/30">
          <Link
            href={`/votes/${vote.vote_id}`}
            onClick={handleClose}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            <span>לדף ההצבעה המלא</span>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function VoteModalSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-14 bg-muted rounded-xl" />
      <div className="h-8 bg-muted rounded-full w-full" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-16 bg-muted rounded-xl" />
        <div className="h-16 bg-muted rounded-xl" />
        <div className="h-16 bg-muted rounded-xl" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-muted rounded w-1/3" />
        {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted rounded-lg" />)}
      </div>
    </div>
  );
}

function VoteModalContent({ vote, detail }: { vote: RecentVote; detail: ReturnType<typeof useVoteDetail>["data"] }) {
  if (!detail) return null;
  const total = vote.total_for + vote.total_against + vote.total_abstain || 1;

  const hasContext =
    vote.sess_item_dscr &&
    vote.sess_item_dscr.trim() !== (vote.vote_item_dscr || "").trim() &&
    vote.sess_item_dscr.trim().length > 0;

  const termKey = voteTypeToTermKey(vote.vote_item_dscr);

  return (
    <div className="space-y-5">
      {/* AI explanation — this specific vote, then (if known) what its type means */}
      <AiExplanation subjectType="vote" subjectId={vote.vote_id} />
      {termKey && <AiExplanation term={termKey} />}

      {/* Result banner */}
      <div className={cn(
        "flex items-center gap-2.5 rounded-xl px-4 py-3",
        vote.is_accepted
          ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300 border border-green-200 dark:border-green-800"
          : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-800"
      )}>
        {vote.is_accepted
          ? <CheckCircle2 className="h-5 w-5 shrink-0" />
          : <XCircle className="h-5 w-5 shrink-0" />
        }
        <span className="font-bold text-sm">
          {vote.is_accepted ? "ההצבעה עברה" : "ההצבעה נדחתה"}
        </span>
        {vote.session_num > 0 && (
          <span className="text-xs opacity-70 ms-auto">ישיבה {vote.session_num}</span>
        )}
      </div>

      {/* Context title if richer */}
      {hasContext && (
        <div className="bg-muted/30 rounded-xl border border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">נושא הדיון</p>
          <p className="text-sm text-foreground/90 leading-relaxed">{vote.sess_item_dscr}</p>
        </div>
      )}

      {/* Breakdown bar */}
      <VoteBreakdownBar
        totalFor={vote.total_for}
        totalAgainst={vote.total_against}
        totalAbstain={vote.total_abstain}
        showLabels
      />

      {/* Percent tiles */}
      <div className="grid grid-cols-3 gap-2">
        <PercentTile label="בעד" count={vote.total_for} total={total}
          colorClass="text-vote-for bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" />
        <PercentTile label="נגד" count={vote.total_against} total={total}
          colorClass="text-vote-against bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" />
        <PercentTile label="נמנע" count={vote.total_abstain} total={total}
          colorClass="text-vote-abstain bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800" />
      </div>

      {/* Faction breakdown */}
      {(detail.party_breakdown?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">הצבעה לפי סיעה</p>
          <p className="text-[11px] text-muted-foreground mb-2">לחצו על סיעה כדי לראות את עמדת כל חבר כנסת</p>
          <FactionVotePanel
            partyBreakdown={detail.party_breakdown}
            mkVotes={detail.mk_votes}
          />
        </div>
      )}
    </div>
  );
}

// ─── Shared small components ──────────────────────────────────────────────────

function PercentTile({ label, count, total, colorClass }: {
  label: string; count: number; total: number; colorClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-center", colorClass)}>
      <p className="text-lg font-bold tabular-nums leading-none">{pct}%</p>
      <p className="text-[11px] font-medium mt-1">{count.toLocaleString("he-IL")} {label}</p>
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
