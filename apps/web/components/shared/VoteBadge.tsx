import { cn } from "@/lib/utils";

type VoteDecision = "for" | "against" | "abstain" | "absent";

const CONFIG: Record<VoteDecision, { label: string; className: string }> = {
  for:     { label: "בעד",  className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  against: { label: "נגד",  className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  abstain: { label: "נמנע", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  absent:  { label: "נעדר", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

interface VoteBadgeProps {
  decision: VoteDecision | boolean; // boolean for is_accepted
  className?: string;
}

export function VoteBadge({ decision, className }: VoteBadgeProps) {
  // Handle is_accepted boolean → accepted/rejected badge
  if (typeof decision === "boolean") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
          decision
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
          className
        )}
      >
        {decision ? "עבר" : "נדחה"}
      </span>
    );
  }

  const cfg = CONFIG[decision] ?? CONFIG.absent;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        cfg.className,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

/** Status badge for bill status */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const isPassed = status.includes("עבר") || status.includes("הפך לחוק");
  const isRejected = status.includes("נדחה") || status.includes("פג תוקף");
  const isInProgress = status.includes("ועדה") || status.includes("קריאה");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        isPassed   && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        isRejected && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        isInProgress && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
        !isPassed && !isRejected && !isInProgress && "bg-muted text-muted-foreground",
        className
      )}
    >
      {status}
    </span>
  );
}
