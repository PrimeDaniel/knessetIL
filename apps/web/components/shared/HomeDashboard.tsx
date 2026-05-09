"use client";

import { useState } from "react";
import Link from "next/link";
import { useDashboard } from "@/hooks/useParties";
import { useVoteDetail } from "@/hooks/useVotes";
import { StatCard } from "@/components/shared/StatCard";
import { Skeleton, SkeletonCard } from "@/components/shared/SkeletonCard";
import { VoteBreakdownBar } from "@/components/charts/VoteBreakdownBar";
import { formatDateHe } from "@/lib/utils";
import type { RecentVote, PartyVoteBreakdown } from "@knesset/types";
import {
  CheckCircle2, XCircle, FileText, Users, Scale,
  ChevronLeft, ChevronDown, ChevronUp, BarChart3, TrendingUp, ArrowLeft,
  Vote, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Map vote_item_dscr short values to nicer labels + colours
const VOTE_TYPE_META: Record<string, { label: string; color: string }> = {
  "הסתייגות":               { label: "הסתייגות", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  "קריאה שניה ושלישית":     { label: "ק׳ שנייה ושלישית", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "קריאה ראשונה":           { label: "קריאה ראשונה", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  "הצבעת אי-אמון":         { label: "אי-אמון", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
  "אישור":                  { label: "אישור", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
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
        <div className="flex flex-col gap-3">
          {data.recent_votes.slice(0, 8).map((vote) => (
            <VoteCard key={vote.vote_id} vote={vote} />
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

function VoteCard({ vote }: { vote: RecentVote }) {
  const [expanded, setExpanded] = useState(false);

  // Lazy-load full vote detail (including faction breakdown) only when expanded
  const { data: detail, isLoading: detailLoading } = useVoteDetail(vote.vote_id, expanded);

  const typeMeta = getVoteTypeMeta(vote.vote_item_dscr || "");

  // Prefer the session context (topic/bill name) as the primary title when it's
  // richer than the item description (which is often just "הסתייגות")
  const primaryTitle =
    vote.sess_item_dscr && vote.sess_item_dscr.trim().length > (vote.vote_item_dscr || "").trim().length
      ? vote.sess_item_dscr
      : vote.vote_item_dscr || "הצבעה ללא כותרת";

  const hasContext =
    vote.sess_item_dscr &&
    vote.sess_item_dscr.trim() !== (vote.vote_item_dscr || "").trim() &&
    vote.sess_item_dscr.trim().length > 0;

  const total = vote.total_for + vote.total_against + vote.total_abstain || 1;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-card transition-all overflow-hidden",
        expanded
          ? "border-primary/30 shadow-card-md"
          : "border-border hover:border-primary/20 hover:shadow-card-md"
      )}
    >
      {/* Accent bar top */}
      <div
        className={cn(
          "h-1 w-full",
          vote.is_accepted
            ? "bg-gradient-to-l from-green-500 to-emerald-400"
            : "bg-gradient-to-l from-red-500 to-rose-400"
        )}
      />

      {/* Clickable header */}
      <button
        type="button"
        className="w-full text-start p-4 focus:outline-none"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          {/* Result icon */}
          <div
            className={cn(
              "mt-0.5 shrink-0 rounded-full p-1.5",
              vote.is_accepted
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {vote.is_accepted
              ? <CheckCircle2 className="h-4 w-4" />
              : <XCircle className="h-4 w-4" />
            }
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
              {primaryTitle}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/* Vote type badge */}
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", typeMeta.color)}>
                <Vote className="h-2.5 w-2.5 ml-1" />
                {typeMeta.label}
              </span>

              {/* Date */}
              <span className="text-[11px] text-muted-foreground">
                {formatDateHe(vote.vote_date)}
              </span>

              {vote.session_num > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  · ישיבה {vote.session_num}
                </span>
              )}
            </div>

            {/* Compact breakdown bar + counts */}
            <div className="mt-2.5 space-y-1">
              {/* Stacked bar */}
              <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/60">
                {vote.total_for > 0 && (
                  <div
                    style={{ width: `${(vote.total_for / total) * 100}%` }}
                    className="bg-vote-for"
                    title={`בעד: ${vote.total_for}`}
                  />
                )}
                {vote.total_against > 0 && (
                  <div
                    style={{ width: `${(vote.total_against / total) * 100}%` }}
                    className="bg-vote-against"
                    title={`נגד: ${vote.total_against}`}
                  />
                )}
                {vote.total_abstain > 0 && (
                  <div
                    style={{ width: `${(vote.total_abstain / total) * 100}%` }}
                    className="bg-vote-abstain"
                    title={`נמנע: ${vote.total_abstain}`}
                  />
                )}
              </div>

              {/* Counts row */}
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

                {/* Result badge pushed to end */}
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

          {/* Expand chevron */}
          <div className="shrink-0 mt-1 text-muted-foreground/50">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {/* Expanded details panel */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-4 py-4 space-y-4">
          {/* Full context title if different from primary */}
          {hasContext && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">נושא הדיון</p>
              <p className="text-sm text-foreground/90 leading-relaxed">{vote.sess_item_dscr}</p>
            </div>
          )}

          {/* Full breakdown bar with labels */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">פירוט ההצבעה</p>
            <VoteBreakdownBar
              totalFor={vote.total_for}
              totalAgainst={vote.total_against}
              totalAbstain={vote.total_abstain}
              showLabels
            />
          </div>

          {/* Percentages row */}
          <div className="grid grid-cols-3 gap-2">
            <PercentTile
              label="בעד"
              count={vote.total_for}
              total={total}
              colorClass="text-vote-for bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
            />
            <PercentTile
              label="נגד"
              count={vote.total_against}
              total={total}
              colorClass="text-vote-against bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
            />
            <PercentTile
              label="נמנע"
              count={vote.total_abstain}
              total={total}
              colorClass="text-vote-abstain bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
            />
          </div>

          {/* Faction breakdown — lazy loaded */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">הצבעה לפי סיעה</p>
            {detailLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>טוען נתוני סיעות...</span>
              </div>
            )}
            {!detailLoading && detail && detail.party_breakdown.length > 0 && (
              <FactionBreakdownTable breakdown={detail.party_breakdown} />
            )}
            {!detailLoading && detail && detail.party_breakdown.length === 0 && (
              <p className="text-xs text-muted-foreground">לא נמצאו נתוני סיעות עבור הצבעה זו.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FactionBreakdownTable({ breakdown }: { breakdown: PartyVoteBreakdown[] }) {
  const sorted = [...breakdown].sort(
    (a, b) => (b.for_count + b.against_count + b.abstain_count) - (a.for_count + a.against_count + a.abstain_count)
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-start px-3 py-2 font-semibold text-muted-foreground">סיעה</th>
            <th className="text-center px-2 py-2 font-semibold text-vote-for">בעד</th>
            <th className="text-center px-2 py-2 font-semibold text-vote-against">נגד</th>
            <th className="text-center px-2 py-2 font-semibold text-vote-abstain">נמנע</th>
            <th className="px-2 py-2 min-w-[80px]" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const active = f.for_count + f.against_count + f.abstain_count;
            if (active === 0) return null;
            return (
              <tr key={f.faction_id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-medium text-foreground max-w-[140px] truncate">
                  {f.faction_name || `סיעה ${f.faction_id}`}
                </td>
                <td className="text-center px-2 py-2">
                  <span className={cn("font-semibold tabular-nums", f.for_count > 0 ? "text-vote-for" : "text-muted-foreground/40")}>
                    {f.for_count}
                  </span>
                </td>
                <td className="text-center px-2 py-2">
                  <span className={cn("font-semibold tabular-nums", f.against_count > 0 ? "text-vote-against" : "text-muted-foreground/40")}>
                    {f.against_count}
                  </span>
                </td>
                <td className="text-center px-2 py-2">
                  <span className={cn("font-semibold tabular-nums", f.abstain_count > 0 ? "text-vote-abstain" : "text-muted-foreground/40")}>
                    {f.abstain_count}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <FactionMiniBar
                    forCount={f.for_count}
                    againstCount={f.against_count}
                    abstainCount={f.abstain_count}
                    total={active}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FactionMiniBar({
  forCount, againstCount, abstainCount, total,
}: {
  forCount: number; againstCount: number; abstainCount: number; total: number;
}) {
  if (total === 0) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full border border-border/40">
      {forCount > 0 && (
        <div style={{ width: `${(forCount / total) * 100}%` }} className="bg-vote-for" />
      )}
      {againstCount > 0 && (
        <div style={{ width: `${(againstCount / total) * 100}%` }} className="bg-vote-against" />
      )}
      {abstainCount > 0 && (
        <div style={{ width: `${(abstainCount / total) * 100}%` }} className="bg-vote-abstain" />
      )}
    </div>
  );
}

function PercentTile({
  label, count, total, colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-center", colorClass)}>
      <p className="text-lg font-bold tabular-nums leading-none">{pct}%</p>
      <p className="text-[11px] font-medium mt-1">{count.toLocaleString("he-IL")} {label}</p>
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
