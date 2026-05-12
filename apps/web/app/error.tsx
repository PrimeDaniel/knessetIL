"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h1 className="text-lg font-semibold">אירעה שגיאה בלתי צפויה</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        משהו השתבש. ניתן לנסות שוב או לחזור לדף הבית.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          נסה שוב
        </button>
        <a
          href="/"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent/30 transition-colors"
        >
          דף הבית
        </a>
      </div>
      {error.digest && (
        <p className="text-[11px] text-muted-foreground/50">קוד שגיאה: {error.digest}</p>
      )}
    </div>
  );
}
