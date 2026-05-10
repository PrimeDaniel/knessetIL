import { useQuery } from "@tanstack/react-query";
import { membersApi } from "@/lib/api-client";
import type { MKListParams } from "@knesset/types";

export const memberKeys = {
  all: ["members"] as const,
  list: (params: MKListParams) => ["members", "list", params] as const,
  detail: (id: number) => ["members", "detail", id] as const,
  stats: (id: number) => ["members", "stats", id] as const,
  votes: (id: number, page: number) => ["members", "votes", id, page] as const,
};

export function useMembers(params: MKListParams = {}) {
  return useQuery({
    queryKey: memberKeys.list(params),
    queryFn: () => membersApi.list(params),
  });
}

export function useMember(mkId: number) {
  return useQuery({
    queryKey: memberKeys.detail(mkId),
    queryFn: () => membersApi.get(mkId),
    enabled: !!mkId,
  });
}

export function useMemberStats(mkId: number) {
  return useQuery({
    queryKey: memberKeys.stats(mkId),
    queryFn: () => membersApi.getStats(mkId),
    enabled: !!mkId,
    // Stats computed every 12h on the server; match client stale time
    staleTime: 12 * 60 * 60 * 1000,
  });
}

export function useMemberVotes(mkId: number, page = 1) {
  return useQuery({
    queryKey: memberKeys.votes(mkId, page),
    queryFn: () => membersApi.getVotes(mkId, page),
    enabled: !!mkId,
  });
}
