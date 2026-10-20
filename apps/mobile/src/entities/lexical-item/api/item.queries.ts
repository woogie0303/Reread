import { useQuery } from '@tanstack/react-query';
import { toBook } from '@/entities/book/api/book.queries';
import type { Book } from '@/entities/book/model/types';
import { api } from '@/shared/api/client';
import type {
  ApiBook,
  ApiItem,
  ApiItemDetail,
  ApiSentence,
  ItemStatus,
} from '@/shared/api/types';
import { savedLabel } from '@/shared/lib/date';
import { itemsKey } from './keys';

export type ItemSummary = {
  id: string;
  term: string;
  meaning: string;
  status: ItemStatus;
  met: number;
  books: Book[];
  encounters: { sentenceId: string; surface?: string }[];
  latest?: {
    sentenceId: string;
    text: string;
    page?: number;
    bookTitle?: string;
    savedLabel: string;
  };
  gapDays?: number;
};

type ApiItemSummary = {
  item: ApiItem;
  books: ApiBook[];
  latest: { sentence: ApiSentence; book: ApiBook | null } | null;
  gapDays?: number;
};

function toSummary(row: ApiItemSummary): ItemSummary {
  return {
    id: row.item._id,
    term: row.item.term,
    meaning: row.item.meaning,
    status: row.item.status,
    met: row.item.encounters.length,
    encounters: row.item.encounters.map((e) => ({
      sentenceId: e.sentenceId,
      surface: e.surface,
    })),
    gapDays: row.gapDays,
    books: row.books.map(toBook),
    latest: row.latest
      ? {
          sentenceId: row.latest.sentence._id,
          text: row.latest.sentence.text,
          page: row.latest.sentence.page,
          bookTitle: row.latest.book?.title,
          savedLabel: savedLabel(row.latest.sentence.createdAt),
        }
      : undefined,
  };
}

export function useGetItems(params?: {
  status?: ItemStatus;
  reencountered?: boolean;
  bookId?: string;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.reencountered) search.set('reencountered', 'true');
  if (params?.bookId) search.set('bookId', params.bookId);
  const query = search.toString();

  return useQuery({
    queryKey: [...itemsKey, query],
    queryFn: async () =>
      (await api<ApiItemSummary[]>(`/items${query ? `?${query}` : ''}`)).map(
        toSummary,
      ),
  });
}

export function useGetItem(id?: string) {
  return useQuery({
    queryKey: [...itemsKey, 'detail', id],
    enabled: Boolean(id),
    queryFn: () => api<ApiItemDetail>(`/items/${id}`),
  });
}


export function useTodayItem() {
  const query = useGetItems();
  const confused = (query.data ?? []).filter(
    (item) => item.status === '헷갈려요',
  );
  const today = [...confused].sort(
    (a, b) => (b.gapDays ?? 0) - (a.gapDays ?? 0),
  )[0];
  return { ...query, today };
}
