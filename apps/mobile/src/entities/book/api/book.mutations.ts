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
      pages?: number;
      currentPage?: number;
      genre?: Genre;
      pinned?: boolean;
    }) => api<ApiBook>(`/books/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: booksKey });
      client.invalidateQueries({ queryKey: ['reading'] });
    },
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
