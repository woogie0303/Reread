import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { reportError } from '@/shared/monitoring/sentry';
import type { ApiAsk, ApiAskView, ApiQuota } from '@/shared/api/types';
import { asksKey, quotaKey } from './keys';

export type AskInput =
  | {
      bookId: string;
      page?: number;
      sentences: { text: string; picks: string[] }[];
    }
  | { sentenceId: string; picks: string[] };

export function usePostAsk() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AskInput) =>
      api<ApiAskView[]>('/asks', { method: 'POST', body, timeoutMs: 75_000 }),
    onError: (error) => reportError(error, 'ask.create'),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: asksKey });
      client.invalidateQueries({ queryKey: ['sentences'] });
      client.invalidateQueries({ queryKey: ['items'] });
      client.invalidateQueries({ queryKey: quotaKey });
    },
  });
}

/** @deprecated use usePostAsk */
export const useCreateAsk = usePostAsk;

export function usePostResolveAsk() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<ApiAskView>(`/asks/${id}/resolve`, {
        method: 'POST',
        timeoutMs: 75_000,
      }),
    onError: (error) => reportError(error, 'ask.resolve'),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: asksKey });
      client.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

/** @deprecated use usePostResolveAsk */
export const useResolveAsk = usePostResolveAsk;

export function usePostAdBonus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<ApiQuota>('/asks/quota/ad-bonus', { method: 'POST' }),
    onSuccess: (quota) => client.setQueryData(quotaKey, quota),
  });
}

/** @deprecated use usePostAdBonus */
export const useClaimAdBonus = usePostAdBonus;

export type { ApiAsk, ApiAskView };
