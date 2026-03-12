import { useQuery } from "@tanstack/react-query";
import { billsApi } from "@/lib/api-client";
import type { BillListParams } from "@knesset/types";

export const billKeys = {
  all: ["bills"] as const,
  list: (params: BillListParams) => ["bills", "list", params] as const,
  detail: (id: number) => ["bills", "detail", id] as const,
  votes: (id: number) => ["bills", "votes", id] as const,
};

export function useBills(params: BillListParams = {}) {
  return useQuery({
    queryKey: billKeys.list(params),
    queryFn: () => billsApi.list(params),
  });
}

export function useBill(billId: number) {
  return useQuery({
    queryKey: billKeys.detail(billId),
    queryFn: () => billsApi.get(billId),
    enabled: !!billId,
  });
}

export function useBillVotes(billId: number) {
  return useQuery({
    queryKey: billKeys.votes(billId),
    queryFn: () => billsApi.getVotes(billId),
    enabled: !!billId,
    // Vote breakdowns never change — keep in cache 24h
    staleTime: 24 * 60 * 60 * 1000,
  });
}
