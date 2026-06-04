import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small inline badge shown when the server returned cached (stale) data and is
 * refreshing it in the background. The page stays interactive with the last
 * known data; this just signals "fresher data is on the way".
 */
export function UpdatingNotice({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
        className,
      )}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      מעדכן…
    </span>
  );
}
