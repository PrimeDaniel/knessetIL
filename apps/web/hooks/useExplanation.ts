import { useQuery } from "@tanstack/react-query";
import { explanationsApi } from "@/lib/api-client";
import type { ExplanationSubjectType } from "@knesset/types";

export const explanationKeys = {
  detail: (type: ExplanationSubjectType, id: number) =>
    ["explanation", type, id] as const,
};

/**
 * Fetch an AI explanation for a bill or vote.
 *
 * Disabled until `enabled` is true (the user clicked "הסבר AI"), so we never
 * generate — and never pay for — an explanation nobody asked to see. Once
 * fetched it stays in the React Query cache for the session, and the server
 * persists it forever, so reopening is instant and free.
 */
export function useExplanation(
  type: ExplanationSubjectType,
  id: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: explanationKeys.detail(type, id),
    queryFn: () => explanationsApi.explain(type, id),
    enabled: enabled && !!id,
    staleTime: Infinity, // explanations are immutable once generated
    retry: false,
  });
}
