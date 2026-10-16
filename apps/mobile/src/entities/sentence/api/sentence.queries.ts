import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useGetBooks } from '@/entities/book/api/book.queries';
import { useGetItems } from '@/entities/lexical-item/api/item.queries';
import { api } from '@/shared/api/client';
import type { ApiAskView, ApiSentence } from '@/shared/api/types';
import { buildFeed } from '../lib/feed';
import { sentencesKey } from './keys';

const FEED_PAGE = 50;
const FEED_MAX = 200;

export function useGetSentence(id?: string) {
  return useQuery({
    queryKey: [...sentencesKey, 'one', id],
    enabled: Boolean(id),
    queryFn: () => api<ApiSentence>(`/sentences/${id}`),
  });
}

/** @deprecated use useGetSentence */
export const useSentence = useGetSentence;

export function useGetSentenceAsk(id?: string) {
  return useQuery({
    queryKey: ['asks', 'sentence', id],
    enabled: Boolean(id),
    queryFn: () => api<ApiAskView[]>(`/asks?sentenceId=${id}&limit=20`),
    select: mergeAsks,
  });
}

/** @deprecated use useGetSentenceAsk */
export const useSentenceAsk = useGetSentenceAsk;

function mergeAsks(views: ApiAskView[]): ApiAskView | null {
  if (!views.length) return null;
  const answered = views.filter((view) => view.ask.status === 'answered');
  if (!answered.length) return views[0];

  const [latest, ...older] = answered;
  const seen = new Set(latest.ask.picks.map((p) => p.surface.toLowerCase()));
  const extra = older
    .flatMap((view) => view.ask.picks)
    .filter((pick) => {
      const key = pick.surface.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return extra.length
    ? {
        ...latest,
        ask: { ...latest.ask, picks: [...latest.ask.picks, ...extra] },
      }
    : latest;
}

export function useGetLikedSentences(bookId?: string) {
  return useQuery({
    queryKey: [...sentencesKey, 'liked', bookId],
    enabled: Boolean(bookId),
    queryFn: () => api<ApiSentence[]>(`/sentences?bookId=${bookId}&liked=true`),
  });
}

/** @deprecated use useGetLikedSentences */
export const useLikedSentences = useGetLikedSentences;

export function useSentenceFeed() {
  const [limit, setLimit] = useState(FEED_PAGE);

  const asks = useQuery({
    queryKey: ['asks', 'feed', limit],
    queryFn: () => api<ApiAskView[]>(`/asks?limit=${limit}`),
  });
  const liked = useQuery({
    queryKey: [...sentencesKey, 'liked', 'all', limit],
    queryFn: () => api<ApiSentence[]>(`/sentences?liked=true&limit=${limit}`),
  });
  const books = useGetBooks();
  const items = useGetItems();

  const all = buildFeed({
    asks: asks.data ?? [],
    liked: liked.data ?? [],
    books: books.data ?? [],
    items: items.data ?? [],
  });
  const waiting = all.filter((row) => row.pending);
  const feed = all.filter((row) => !row.pending);
  const settled = !asks.isPending && !liked.isPending;
  const brimming =
    (asks.data?.length ?? 0) >= limit || (liked.data?.length ?? 0) >= limit;

  return {
    feed,
    waiting,
    isPending: asks.isPending || liked.isPending,
    error: asks.error ?? liked.error ?? null,
    hasMore: settled && brimming && limit < FEED_MAX,
    loadingMore: limit > FEED_PAGE && (asks.isFetching || liked.isFetching),
    loadMore: () => setLimit((n) => Math.min(FEED_MAX, n + FEED_PAGE)),
  };
}

export function useGetBookSentenceFeed(bookId: string) {
  const sentences = useQuery({
    queryKey: [...sentencesKey, 'book', bookId],
    queryFn: () =>
      api<ApiSentence[]>(`/sentences?bookId=${bookId}&limit=${FEED_MAX}`),
  });
  const items = useGetItems({ bookId });

  const rows = buildFeed({
    asks: [],
    liked: sentences.data ?? [],
    books: [],
    items: items.data ?? [],
  }).filter((row) => row.claimed);

  return { rows, isPending: sentences.isPending || items.isPending };
}

/** @deprecated use useGetBookSentenceFeed */
export const useBookSentenceFeed = useGetBookSentenceFeed;
