import { useMutation } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api<void>('/readers/me', { method: 'DELETE' }),
  });
}
