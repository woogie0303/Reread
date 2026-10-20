import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ReaderView } from '@/shared/api/types';
import { readerKey } from './keys';

export function useGetReader() {
  return useQuery({
    queryKey: readerKey,
    queryFn: () => api<ReaderView>('/readers/me'),
  });
}

