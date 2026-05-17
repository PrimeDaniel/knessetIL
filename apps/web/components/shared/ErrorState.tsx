import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  detail?: string;
  className?: string;
}

export function ErrorState({
  message = "שגיאה בטעינת נתונים",
  detail = "ודאו שהשרת פועל ונסו לרענן את הדף.",
  className,
}: ErrorStateProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive ${className ?? ""}`}
    >
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">{message}</p>
        {detail && <p className="text-xs mt-0.5 opacity-80">{detail}</p>}
      </div>
    </div>
  );
}
