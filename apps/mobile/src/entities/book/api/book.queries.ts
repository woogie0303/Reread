import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ApiBook, Genre } from '@/shared/api/types';
import type { Book } from '../model/types';
import { booksKey } from './keys';

/**
 * 서버의 책을 화면이 쓰는 모양으로 옮긴다.
 *
 * 책등 색이 비어 오는 경우가 있다(직접 등록한 책). 그때도 그라디언트는
 * 있어야 한다 — 라벨 없이 출처를 말하는 일을 이 색이 하기 때문이다.
 */
export function toBook(raw: ApiBook): Book {
  const [from, to] = raw.spine.length >= 2 ? raw.spine : DEFAULT_SPINE;
  return {
    id: raw._id,
    title: raw.title,
    author: raw.author,
    pages: raw.pages ?? 0,
    currentPage: raw.currentPage,
    cover: raw.cover,
    genre: raw.genre,
    pinned: raw.pinned,
    spine: [from, to] as const,
    primer: undefined,
  };
}

const DEFAULT_SPINE = ['#8E9AAF', '#5C6784'] as const;

export function useGetBooks() {
  return useQuery({
    queryKey: booksKey,
    queryFn: async () => (await api<ApiBook[]>('/books')).map(toBook),
  });
}

export function useGetBook(id?: string) {
  return useQuery({
    queryKey: [...booksKey, id],
    enabled: Boolean(id),
    queryFn: async () => toBook(await api<ApiBook>(`/books/${id}`)),
  });
}


/**
 * 읽고 있는 책들. 맨 앞은 **핀이 꽂힌 책** — 고정한 책이 있으면 그 책, 없으면
 * 가장 최근에 **등록한** 책이다. 나머지는 가장 최근에 편 것부터.
 */
export function useGetReadingBooks() {
  return useQuery({
    queryKey: [...booksKey, 'reading'],
    queryFn: async () => {
      const books = await api<ApiBook[]>('/books?finished=false');
      const hero =
        books.find((book) => book.pinned) ??
        [...books].sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
      const rest = books.filter((book) => book !== hero).sort(byLastRead);
      return (hero ? [{ ...hero, pinned: true }, ...rest] : rest).map(
        (raw) => ({
          book: toBook(raw),
          progress: raw,
        }),
      );
    },
  });
}


export function useCurrentBook() {
  const query = useGetReadingBooks();
  return { ...query, data: query.data ? (query.data[0] ?? null) : undefined };
}

export type BookSearchResult = {
  title: string;
  author: string;
  pages?: number;
  cover?: string;
  publisher?: string;
  genre?: Genre;
};

export function useGetBookSearch(query: string) {
  return useQuery({
    queryKey: [...booksKey, 'search', query],
    enabled: query.trim().length > 0,
    queryFn: () =>
      api<BookSearchResult[]>(
        `/books/search?q=${encodeURIComponent(query.trim())}`,
      ),
    staleTime: 60_000,
  });
}


function byLastRead(a: ApiBook, b: ApiBook): number {
  return time(b.lastReadAt ?? b.startedAt) - time(a.lastReadAt ?? a.startedAt);
}

function time(iso?: string): number {
  return iso ? new Date(iso).getTime() : 0;
}
