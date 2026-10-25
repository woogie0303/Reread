import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ApiBook, Genre } from '@/shared/api/types';
import { spineFor } from '../lib/spine';
import { booksKey } from './keys';

export function useCreateBook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      author: string;
      pages?: number;
      currentPage?: number;
      cover?: string;
      genre?: Genre;
    }) => {
      const [from, to] = spineFor(input.title);
      return api<ApiBook>('/books', {
        method: 'POST',
        body: {
          ...input,
          spine: [from, to],
          startedAt: new Date().toISOString(),
        },
      });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: booksKey });
      client.invalidateQueries({ queryKey: ['reading'] });
    },
  });
}

export function useUpdateBook(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      title?: string;
      author?: string;
      /** null이면 전체 쪽수를 지운다 — 빼고 보내면 '안 고침'이다 */
      pages?: number | null;
      currentPage?: number;
      genre?: Genre;
      pinned?: boolean;
    }) => api<ApiBook>(`/books/${id}`, { method: 'PATCH', body: patch }),
    /**
     * 새 목록을 받을 때까지 기다린다(돌려준 Promise가 끝나야 요청이 끝난 것이 된다).
     * 안 기다리면 책 화면의 핀이 '고정 중'으로 찼다가, 요청이 끝난 순간 아직 옛 목록이라
     * 비었다가, 새 목록이 오면 다시 차서 깜박였다.
     */
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: booksKey }),
        client.invalidateQueries({ queryKey: ['reading'] }),
      ]),
  });
}

export function useDeleteBook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ deletedSentences: number }>(`/books/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      for (const key of [
        booksKey,
        ['reading'],
        ['sentences'],
        ['items'],
        ['asks'],
      ]) {
        client.invalidateQueries({ queryKey: key });
      }
    },
  });
}
