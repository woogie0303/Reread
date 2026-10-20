import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ApiSentence } from '@/shared/api/types';
import { sentencesKey } from './keys';

export function useDeleteSentence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/sentences/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: sentencesKey });
      client.invalidateQueries({ queryKey: ['items'] });
      client.invalidateQueries({ queryKey: ['asks'] });
    },
  });
}

export function useDeleteExpressions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/sentences/${id}/expressions`, { method: 'DELETE' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: sentencesKey });
      client.invalidateQueries({ queryKey: ['items'] });
      client.invalidateQueries({ queryKey: ['asks'] });
    },
  });
}

export function usePostThought(sentenceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api<ApiSentence>(`/sentences/${sentenceId}/thoughts`, {
        method: 'POST',
        body: { text },
      }),
    onSuccess: (sentence) =>
      client.setQueryData([...sentencesKey, 'one', sentenceId], sentence),
  });
}

export function useDeleteThought(sentenceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (thoughtId: string) =>
      api<ApiSentence>(`/sentences/${sentenceId}/thoughts/${thoughtId}`, {
        method: 'DELETE',
      }),
    onSuccess: (sentence) =>
      client.setQueryData([...sentencesKey, 'one', sentenceId], sentence),
  });
}

export function usePatchSentenceFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      api<ApiSentence>(`/sentences/${id}`, {
        method: 'PATCH',
        body: { favorite },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: sentencesKey });
      client.invalidateQueries({ queryKey: ['asks'] });
    },
  });
}

export function usePostSentence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { bookId: string; text: string; page?: number }) =>
      api<ApiSentence>('/sentences', { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: sentencesKey }),
  });
}

