import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toBook } from '@/entities/book/api/book.api';
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

/** 서랍의 한 줄에 필요한 것 전부 — 목록 한 번으로 온다 */
export type ItemSummary = {
  id: string;
  term: string;
  meaning: string;
  status: ItemStatus;
  /** 몇 번 만났는지. 둘 이상이면 재회다. */
  met: number;
  books: Book[];
  /**
   * 이 항목을 만난 문장들. 문장 피드가 밑줄을 놓을 자리를 여기서 찾는다 —
   * 문장→항목 방향 API가 없어서, 목록을 받아 앱에서 뒤집어 쓴다.
   */
  encounters: { sentenceId: string; surface?: string }[];
  /**
   * 가장 최근에 만난 문장. `sentenceId`가 있어야 `encounters`에서 그 문장에
   * 쳐진 밑줄(surface)을 찾을 수 있다 — 문장 안에 표현을 그리려면 필요하다.
   */
  latest?: {
    sentenceId: string;
    text: string;
    page?: number;
    bookTitle?: string;
    savedLabel: string;
  };
  /** 처음과 마지막 사이의 날수 — '2개월 만에'로 옮기는 일은 화면이 한다 */
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

export const itemsKey = ['items'] as const;

export function useItems(params?: {
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
    queryFn: async () => {
      const rows = (
        await api<ApiItemSummary[]>(`/items${query ? `?${query}` : ''}`)
      ).map(toSummary);
      return rows;
    },
  });
}

export function useItem(id?: string) {
  return useQuery({
    queryKey: [...itemsKey, 'detail', id],
    enabled: Boolean(id),
    queryFn: () => api<ApiItemDetail>(`/items/${id}`),
  });
}

export function useUpdateItem(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { status?: ItemStatus; meaning?: string }) =>
      api<ApiItem>(`/items/${id}`, { method: 'PATCH', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: itemsKey }),
  });
}

/**
 * 이 표현을 고른 문장들에서 한꺼번에 뺀다. 만난 문장을 전부 고르면 표현이 서랍에서
 * 사라지고(`removed: 'item'`), 표현이 빠져 담은 표현이 하나도 안 남은 문장은 서버가 함께
 * 정리한다(`sentencesRemoved`). 문장·질문 목록과 밑줄이 바뀌므로 셋 다 다시 받는다.
 */
export function useRemoveEncounters() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; sentenceIds: string[] }) =>
      api<{ removed: 'encounter' | 'item'; sentencesRemoved: number }>(
        `/items/${input.itemId}/encounters/remove`,
        { method: 'POST', body: { sentenceIds: input.sentenceIds } },
      ),
    onSuccess: (result, input) => {
      /** 사라진 표현의 상세를 다시 받으면 404가 뜬다 — 받아둔 것부터 치운다 */
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

/**
 * 오늘 다시 볼 표현 하나. 아직 헷갈린다고 둔 것 중에서 처음과 마지막 사이가
 * 가장 벌어진 항목을 고른다 — 오래 잊고 지내다 또 걸린 표현일수록 오늘 다시
 * 꺼낼 이유가 크다.
 */
export function useTodayItem() {
  const query = useItems();
  const confused = (query.data ?? []).filter(
    (item) => item.status === '헷갈려요',
  );
  const today = [...confused].sort(
    (a, b) => (b.gapDays ?? 0) - (a.gapDays ?? 0),
  )[0];
  return { ...query, today };
}
