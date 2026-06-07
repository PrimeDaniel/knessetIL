"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { useBill, useBillVotes } from "@/hooks/useBills";
import { FactionVotePanel } from "@/components/votes/FactionVotePanel";
import { VoteBreakdownBar } from "@/components/charts/VoteBreakdownBar";
import { AiExplanation } from "@/components/shared/AiExplanation";
import { formatDateHe, cn } from "@/lib/utils";
import type { BillDetail } from "@knesset/types";
import {
  ChevronRight, ChevronLeft, X, ArrowLeft,
  BookOpen, Calendar, FileText, Tag, Users, CheckCircle2, XCircle,
} from "lucide-react";

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

const STATUS_COLOR: Record<string, string> = {
  "עבר/ה":   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  "נדחה/ה":  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  "בוועדה":  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  "הוגש":    "bg-muted text-muted-foreground border-border",
  "פג תוקף": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
};

function MetaTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 space-y-0.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function BillModalSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex gap-2">
        <div className="h-6 w-20 bg-muted rounded-full" />
        <div className="h-6 w-24 bg-muted rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-3 space-y-1.5">
            <div className="h-3 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-muted rounded w-1/3" />
        {[...Array(3)].map((_, i) => <div key={i} className="h-9 bg-muted rounded-lg" />)}
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-muted rounded w-1/4" />
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-5/6" />
      </div>
    </div>
  );
}

function BillModalContent({ bill, billId }: { bill: BillDetail; billId: number }) {
  const { data: voteDetail, isLoading: voteLoading } = useBillVotes(billId);
  const statusColor = STATUS_COLOR[bill.status_desc] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-5">
      {/* AI explanation */}
      <AiExplanation subjectType="bill" subjectId={billId} />

      {/* Status + type badges */}
      <div className="flex flex-wrap gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", statusColor)}>
          {bill.status_desc}
        </span>
        {bill.sub_type_desc && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <Tag className="h-3 w-3" />
            {bill.sub_type_desc}
          </span>
        )}
        {bill.is_continuation && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            המשך חקיקה
          </span>
        )}
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetaTile icon={BookOpen} label="כנסת" value={`כנסת ${bill.knesset_num}`} />
        {bill.publication_date && (
          <MetaTile icon={Calendar} label="פרסום" value={formatDateHe(bill.publication_date)} />
        )}
        {bill.publication_num && (
          <MetaTile icon={FileText} label="מספר פרסום" value={`${bill.publication_num}`} />
        )}
        {(bill.initiators?.length ?? 0) > 0 && (
          <MetaTile icon={Users} label="יוזמים" value={`${bill.initiators.length} חברי כנסת`} />
        )}
      </div>

      {/* Initiators */}
      {(bill.initiators?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">יוזמי ההצעה</p>
          <div className="flex flex-col gap-1.5">
            {bill.initiators.map((mk) => (
              <Link
                key={mk.mk_individual_id}
                href={`/members/${mk.mk_individual_id}`}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2 hover:bg-muted hover:border-primary/20 transition-all group"
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                  {mk.mk_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{mk.mk_name}</p>
                  {mk.faction_name && (
                    <p className="text-[11px] text-muted-foreground truncate">{mk.faction_name}</p>
                  )}
                </div>
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary/50 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {bill.summary_law && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">תקציר</p>
          <p className="text-sm text-foreground/90 leading-relaxed bg-muted/30 rounded-xl border border-border p-4">
            {bill.summary_law}
          </p>
        </div>
      )}

      {/* Vote breakdown */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">תוצאת ההצבעה</p>
        {voteLoading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-12 bg-muted rounded-xl" />
            <div className="h-8 bg-muted rounded-full" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-14 bg-muted rounded-xl" />
              <div className="h-14 bg-muted rounded-xl" />
              <div className="h-14 bg-muted rounded-xl" />
            </div>
          </div>
        )}
        {!voteLoading && voteDetail && (
          <div className="space-y-4">
            <div className={cn(
              "flex items-center gap-2.5 rounded-xl px-4 py-3 border",
              voteDetail.is_accepted
                ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
                : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"
            )}>
              {voteDetail.is_accepted
                ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                : <XCircle className="h-5 w-5 shrink-0" />
              }
              <span className="font-bold text-sm">
                {voteDetail.is_accepted ? "ההצעה עברה" : "ההצעה נדחתה"}
              </span>
              {voteDetail.vote_date && (
                <span className="text-xs opacity-70 ms-auto">{formatDateHe(voteDetail.vote_date)}</span>
              )}
            </div>
            <VoteBreakdownBar
              totalFor={voteDetail.total_for}
              totalAgainst={voteDetail.total_against}
              totalAbstain={voteDetail.total_abstain}
              showLabels
            />
            {(voteDetail.party_breakdown?.length ?? 0) > 0 && (
              <div>
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
          <p className="text-sm text-muted-foreground text-center py-4 bg-muted/20 rounded-xl border border-border">
            לא נמצאו נתוני הצבעה עבור הצעת חוק זו.
          </p>
        )}
      </div>

      {/* Related bills */}
      {(bill.related_bills?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">הצעות קשורות</p>
          <div className="flex flex-col gap-1.5">
            {bill.related_bills.slice(0, 3).map((rb) => (
              <Link
                key={rb.bill_id}
                href={`/bills/${rb.bill_id}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted hover:border-primary/20 transition-all group text-sm text-foreground/80 group-hover:text-primary"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{rb.name}</span>
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function BillModal({ billId, onClose }: { billId: number; onClose: () => void }) {
  const { data: bill, isLoading } = useBill(billId);
  const handleClose = useCallback(() => onClose(), [onClose]);

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
        <div className="h-1.5 bg-gradient-to-l from-primary via-brand-400 to-brand-300 shrink-0" />

        <div className="flex items-start gap-3 p-5 pb-4 border-b border-border shrink-0">
          <ModalBackButton onClose={handleClose} />
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-5 bg-muted rounded-md animate-pulse w-3/4" />
                <div className="h-3 bg-muted rounded-md animate-pulse w-1/2" />
              </div>
            ) : bill ? (
              <>
                <h2 className="text-base font-bold text-foreground leading-snug">{bill.name}</h2>
                {bill.name_eng && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{bill.name_eng}</p>
                )}
              </>
            ) : null}
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

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {isLoading ? (
            <BillModalSkeleton />
          ) : bill ? (
            <BillModalContent bill={bill} billId={billId} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">לא נמצאו נתונים</p>
          )}
        </div>

        {!isLoading && bill && (
          <div className="border-t border-border p-4 shrink-0 bg-muted/30">
            <Link
              href={`/bills/${bill.bill_id}`}
              onClick={handleClose}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              <span>לדף המלא</span>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
