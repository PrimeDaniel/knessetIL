import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  className?: string;
}

export function EmptyState({ icon: Icon, message, className }: EmptyStateProps) {
  return (
    <div className={`py-20 text-center ${className ?? ""}`}>
      {Icon && <Icon className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />}
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
