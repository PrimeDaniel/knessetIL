import { useQuery } from "@tanstack/react-query";
import { partiesApi, statsApi } from "@/lib/api-client";
import type { PartyListParams } from "@knesset/types";

export const partyKeys = {
  all: ["parties"] as const,
  list: (params: PartyListParams) => ["parties", "list", params] as const,
  detail: (id: number) => ["parties", "detail", id] as const,
  cohesion: (id: number) => ["parties", "cohesion", id] as const,
};

export const dashboardKeys = {
  all: ["dashboard"] as const,
};

export function useParties(params: PartyListParams = {}) {
  return useQuery({
    queryKey: partyKeys.list(params),
    queryFn: () => partiesApi.list(params),
  });
}

export function useParty(factionId: number) {
  return useQuery({
    queryKey: partyKeys.detail(factionId),
    queryFn: () => partiesApi.get(factionId),
    enabled: !!factionId,
  });
}

export function usePartyCohesion(factionId: number) {
  return useQuery({
    queryKey: partyKeys.cohesion(factionId),
    queryFn: () => partiesApi.getCohesion(factionId),
    enabled: !!factionId,
    staleTime: 12 * 60 * 60 * 1000,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: () => statsApi.dashboard(),
    staleTime: 60 * 60 * 1000, // 1h — matches server TTL
  });
}
