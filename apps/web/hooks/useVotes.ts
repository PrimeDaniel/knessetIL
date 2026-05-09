import { useQuery } from "@tanstack/react-query";
import { votesApi } from "@/lib/api-client";

export const voteKeys = {
  all: ["votes"] as const,
  detail: (id: number) => ["votes", "detail", id] as const,
};

export function useVoteDetail(voteId: number, enabled = true) {
  return useQuery({
    queryKey: voteKeys.detail(voteId),
    queryFn: () => votesApi.get(voteId),
    enabled: enabled && !!voteId,
    staleTime: 24 * 60 * 60 * 1000, // votes are historical — never change
  });
}
