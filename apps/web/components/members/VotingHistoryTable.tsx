"use client";

import { VoteBadge } from "@/components/shared/VoteBadge";
import { Pagination } from "@/components/shared/Pagination";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { formatDateHe } from "@/lib/utils";
import { useMemberVotes } from "@/hooks/useMembers";
import { useState } from "react";

interface VotingHistoryTableProps {
  mkId: number;
}

export function VotingHistoryTable({ mkId }: VotingHistoryTableProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMemberVotes(mkId, page);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="h-12" />
        ))}
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        אין נתוני הצבעות זמינים.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-start font-medium">נושא ההצבעה</th>
              <th className="px-4 py-2.5 text-start font-medium">תאריך</th>
              <th className="px-4 py-2.5 text-start font-medium">תוצאה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.data.map((vote) => (
              <tr key={vote.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="line-clamp-1">
                    {vote.vote_item_dscr || `הצבעה #${vote.id}`}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {vote.vote_date ? formatDateHe(vote.vote_date) : "—"}
                </td>
                <td className="px-4 py-3">
                  <VoteBadge decision={vote.is_accepted} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          totalPages={data.pagination.total_pages}
          total={data.pagination.total}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
