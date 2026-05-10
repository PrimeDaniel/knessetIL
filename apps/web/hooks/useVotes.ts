import { useQuery } from "@tanstack/react-query";
import { votesApi } from "@/lib/api-client";
import type { VoteListParams } from "@knesset/types";

export const voteKeys = {
  all: ["votes"] as const,
  list: (params: VoteListParams) => ["votes", "list", params] as const,
  detail: (id: number) => ["votes", "detail", id] as const,
};

export function useVotes(params: VoteListParams = {}) {
  return useQuery({
    queryKey: voteKeys.list(params),
    queryFn: () => votesApi.list(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useVoteDetail(voteId: number, enabled = true) {
  return useQuery({
    queryKey: voteKeys.detail(voteId),
    queryFn: () => votesApi.get(voteId),
    enabled: enabled && !!voteId,
    staleTime: 24 * 60 * 60 * 1000, // votes are historical — never change
  });
}
