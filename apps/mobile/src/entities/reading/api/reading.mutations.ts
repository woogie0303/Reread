import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ApiBook } from '@/shared/api/types';
import { readingKey } from './keys';

export function usePatchProgress(bookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (currentPage: number) =>
      api<ApiBook>(`/books/${bookId}`, {
        method: 'PATCH',
        body: { currentPage },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['books'] });
      client.invalidateQueries({ queryKey: readingKey });
    },
  });
}

