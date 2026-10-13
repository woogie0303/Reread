import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { reportError } from '@/shared/monitoring/sentry';
import type { ApiAsk, ApiAskView, ApiQuota } from '@/shared/api/types';

export const asksKey = ['asks'] as const;
export const quotaKey = ['asks', 'quota'] as const;

/** 이번 달 남은 질문. 다 써도 문장은 그대로 담긴다. */
export function useAskQuota() {
  return useQuery({
    queryKey: quotaKey,
    queryFn: () => api<ApiQuota>('/asks/quota'),
  });
}

/** 답을 기다리는 문장들 */
export function usePendingAsks() {
  return useQuery({
    queryKey: [...asksKey, 'pending'],
    queryFn: () => api<ApiAskView[]>('/asks?status=pending'),
  });
}

export function useAsk(id?: string) {
  return useQuery({
    queryKey: [...asksKey, id],
    enabled: Boolean(id),
    queryFn: () => api<ApiAskView>(`/asks/${id}`),
  });
}

/**
 * 묻는 두 가지 길. 어느 쪽이든 **독자가 고른 표현**(문장에 적힌 꼴 그대로)을 함께
 * 보낸다 — 무엇을 모르는지는 독자가 정하고, 서버는 답이 오면 그것들을 바로 담는다.
 *
 * - `{ bookId, page, sentences }` — 방금 옮겨 적은 문장들. 한 쪽에서 여러 문장을
 *   한 번에 묻고, 이번 달 질문은 한 번만 쓴다.
 * - `{ sentenceId, picks }` — **이미 담아둔 문장**을 나중에 묻는다(ADR-0004). 이쪽으로
 *   보내야 같은 글이 두 줄이 되지 않는다. 책과 쪽수는 그 문장이 이미 안다.
 */
export type AskInput =
  | {
      bookId: string;
      page?: number;
      sentences: { text: string; picks: string[] }[];
    }
  | { sentenceId: string; picks: string[] };

/**
 * 묻는다. 답을 못 받아도 실패가 아니다 — 문장은 저장되고 질문은 pending으로
 * 남는다. 그래서 오류를 띄우는 대신 상태를 보여준다. 문장 순서대로 질문이 온다.
 */
export function useCreateAsk() {
  const client = useQueryClient();
  return useMutation({
    /**
     * 모델이 답하는 데 몇 초가 걸린다. 서버는 45초에 포기하고 '연결 실패'로 기다리게 하니,
     * 앱은 그보다 조금 더 기다리고(75초) 그만둔다 — 그 뒤에도 문장은 담겨 있다.
     */
    mutationFn: (body: AskInput) =>
      api<ApiAskView[]>('/asks', { method: 'POST', body, timeoutMs: 75_000 }),
    onError: (error) => reportError(error, 'ask.create'),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: asksKey });
      client.invalidateQueries({ queryKey: ['sentences'] });
      /** 답이 오면 고른 표현이 담겨서 밑줄이 생긴다 */
      client.invalidateQueries({ queryKey: ['items'] });
      client.invalidateQueries({ queryKey: quotaKey });
    },
  });
}

/** 기다리던 질문을 다시 묻는다 — 같은 묶음에서 기다리던 것도 함께 풀린다 */
export function useResolveAsk() {
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

export type { ApiAsk, ApiAskView };

/** 광고를 끝까지 보고 질문을 더 받는다. 한도가 남아 있으면 서버가 거절한다. */
export function useClaimAdBonus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<ApiQuota>('/asks/quota/ad-bonus', { method: 'POST' }),
    onSuccess: (quota) => client.setQueryData(quotaKey, quota),
  });
}
