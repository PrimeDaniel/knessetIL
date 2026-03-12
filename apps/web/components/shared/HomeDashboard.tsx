"use client";

import { useDashboard } from "@/hooks/useParties";
import { StatCard } from "@/components/shared/StatCard";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { formatDateHe } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";

export function HomeDashboard() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold mb-2">שקיפות הכנסת</h1>
          <p className="text-muted-foreground">עקבו אחרי הצבעות, חוקים וחברי כנסת</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>שגיאה בטעינת הנתונים. אנא נסו שוב מאוחר יותר.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Hero */}
      <div>
        <h1 className="text-3xl font-bold mb-2">שקיפות הכנסת</h1>
        <p className="text-muted-foreground text-lg">
          עקבו אחרי הצבעות, חוקים וחברי כנסת — הכל במקום אחד
        </p>
      </div>

      {/* Stats grid */}
      <section>
        <h2 className="text-xl font-semibold mb-4">סטטיסטיקות כנסת {data.knesset_num}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="סך הצבעות" value={data.total_votes_this_knesset} />
          <StatCard label="הצבעות שעברו" value={data.total_votes_accepted} accent="for" />
          <StatCard label="הצבעות שנדחו" value={data.total_votes_rejected} accent="against" />
          <StatCard label="סך הצעות חוק" value={data.total_bills} />
        </div>
      </section>

      {/* Recent votes */}
      <section>
        <h2 className="text-xl font-semibold mb-4">הצבעות אחרונות</h2>
        <div className="flex flex-col gap-3">
          {data.recent_votes.map((vote) => (
            <div
              key={vote.vote_id}
              className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
            >
              {vote.is_accepted ? (
                <CheckCircle2 className="h-5 w-5 text-vote-for shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-vote-against shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{vote.vote_item_dscr}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateHe(vote.vote_date)} ·{" "}
                  <span className="text-vote-for">בעד: {vote.total_for}</span>{" · "}
                  <span className="text-vote-against">נגד: {vote.total_against}</span>
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${
                  vote.is_accepted
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}
              >
                {vote.is_accepted ? "עבר" : "נדחה"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent bills */}
      <section>
        <h2 className="text-xl font-semibold mb-4">הצעות חוק אחרונות</h2>
        <div className="flex flex-col gap-3">
          {data.recent_bills.map((bill) => (
            <a
              key={bill.bill_id}
              href={`/bills/${bill.bill_id}`}
              className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{bill.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {bill.status_desc}
                  {bill.publication_date && ` · ${formatDateHe(bill.publication_date)}`}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
