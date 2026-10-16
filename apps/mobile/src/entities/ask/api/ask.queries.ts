import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ApiAskView, ApiQuota } from '@/shared/api/types';
import { asksKey, quotaKey } from './keys';

export function useGetAskQuota() {
  return useQuery({
    queryKey: quotaKey,
    queryFn: () => api<ApiQuota>('/asks/quota'),
  });
}

/** @deprecated use useGetAskQuota */
export const useAskQuota = useGetAskQuota;

export function useGetPendingAsks() {
  return useQuery({
    queryKey: [...asksKey, 'pending'],
    queryFn: () => api<ApiAskView[]>('/asks?status=pending'),
  });
}

/** @deprecated use useGetPendingAsks */
export const usePendingAsks = useGetPendingAsks;

export function useGetAsk(id?: string) {
  return useQuery({
    queryKey: [...asksKey, id],
    enabled: Boolean(id),
    queryFn: () => api<ApiAskView>(`/asks/${id}`),
  });
}

/** @deprecated use useGetAsk */
export const useAsk = useGetAsk;
