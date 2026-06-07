"use client";

import { useState } from "react";
import { Sparkles, ChevronDown, Loader2, AlertCircle } from "lucide-react";
import { useExplanation } from "@/hooks/useExplanation";
import { STATIC_EXPLANATIONS } from "@/lib/static-explanations";
import type { ExplanationSubjectType } from "@knesset/types";
import { cn } from "@/lib/utils";

type AiExplanationProps =
  | {
      /** Pre-written explanation of a fixed parliamentary term — instant, no API call. */
      term: keyof typeof STATIC_EXPLANATIONS;
      className?: string;
    }
  | {
      /** AI-generated explanation of a specific bill or vote — fetched on first open. */
      subjectType: ExplanationSubjectType;
      subjectId: number;
      className?: string;
    };

export function AiExplanation(props: AiExplanationProps) {
  const [open, setOpen] = useState(false);
  const isStatic = "term" in props;

  // Hook is always called (rules of hooks); only fires for the dynamic case once open.
  const dynamic = !isStatic ? props : null;
  const query = useExplanation(
    dynamic?.subjectType ?? "vote",
    dynamic?.subjectId ?? 0,
    !isStatic && open,
  );

  const staticEntry = isStatic ? STATIC_EXPLANATIONS[props.term] : null;

  return (
    <div className={cn("rounded-xl border border-primary/20 bg-primary/[0.03] overflow-hidden", props.className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-start hover:bg-primary/[0.05] transition-colors"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-sm font-semibold text-primary">
          הסבר AI
          {staticEntry && <span className="text-muted-foreground font-normal"> — {staticEntry.term}</span>}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-primary/60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 pt-0.5">
          {isStatic ? (
            <p className="text-sm leading-relaxed text-foreground/90">{staticEntry?.explanation}</p>
          ) : query.isLoading ? (
            <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>מכין הסבר…</span>
            </div>
          ) : query.isError ? (
            <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>לא ניתן להפיק הסבר כרגע. נסו שוב מאוחר יותר.</span>
            </div>
          ) : query.data ? (
            <>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                {query.data.content}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground/70">
                הסבר זה נוצר אוטומטית על ידי בינה מלאכותית ועשוי להכיל אי-דיוקים.
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
