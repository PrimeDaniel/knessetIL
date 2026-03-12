import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { he } from "date-fns/locale";

/** shadcn/ui standard class merger */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date string to Hebrew locale display format */
export function formatDateHe(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "d בMMMM yyyy", { locale: he });
  } catch {
    return dateStr;
  }
}

/** Format a percentage (0–1 float) to Hebrew-friendly string */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Truncate a Hebrew string at the last complete word before maxLength */
export function truncateHebrew(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s+\S*$/, "") + "…";
}

/** Map vote decision to Tailwind colour class */
export function voteColour(decision: "for" | "against" | "abstain" | "absent"): string {
  const map: Record<string, string> = {
    for: "text-vote-for",
    against: "text-vote-against",
    abstain: "text-vote-abstain",
    absent: "text-vote-absent",
  };
  return map[decision] ?? "text-muted-foreground";
}

/** Map vote decision to hex colour (for Recharts fill prop) */
export function voteHex(decision: "for" | "against" | "abstain" | "absent"): string {
  const map: Record<string, string> = {
    for: "#16a34a",
    against: "#dc2626",
    abstain: "#d97706",
    absent: "#9ca3af",
  };
  return map[decision] ?? "#9ca3af";
}
