import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ApiItem, ItemStatus } from '@/shared/api/types';
import { itemsKey } from './keys';

export function usePatchItem(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { status?: ItemStatus; meaning?: string }) =>
      api<ApiItem>(`/items/${id}`, { method: 'PATCH', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: itemsKey }),
  });
}

/** @deprecated use usePatchItem */
export const useUpdateItem = usePatchItem;

export function usePostRemoveEncounters() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; sentenceIds: string[] }) =>
      api<{ removed: 'encounter' | 'item'; sentencesRemoved: number }>(
        `/items/${input.itemId}/encounters/remove`,
        { method: 'POST', body: { sentenceIds: input.sentenceIds } },
      ),
    onSuccess: (result, input) => {
      if (result.removed === 'item') {
        client.removeQueries({
          queryKey: [...itemsKey, 'detail', input.itemId],
          exact: true,
        });
      }
      client.invalidateQueries({ queryKey: itemsKey });
      client.invalidateQueries({ queryKey: ['sentences'] });
      client.invalidateQueries({ queryKey: ['asks'] });
    },
  });
}

/** @deprecated use usePostRemoveEncounters */
export const useRemoveEncounters = usePostRemoveEncounters;
