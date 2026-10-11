import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ApiBook, Genre } from '@/shared/api/types';
import { samplePrimer } from '../lib/sample';
import { spineFor } from '../lib/spine';
import type { Book } from '../model/types';

/**
 * 서버의 책을 화면이 쓰는 모양으로 옮긴다.
 *
 * 책등 색이 비어 오는 경우가 있다(직접 등록한 책). 그때도 그라디언트는
 * 있어야 한다 — 라벨 없이 출처를 말하는 일을 이 색이 하기 때문이다.
 */
export function toBook(api: ApiBook): Book {
  const [from, to] = api.spine.length >= 2 ? api.spine : DEFAULT_SPINE;
  return {
    id: api._id,
    title: api.title,
    author: api.author,
    pages: api.pages ?? 0,
    currentPage: api.currentPage,
    cover: api.cover,
    genre: api.genre,
    pinned: api.pinned,
    spine: [from, to] as const,
    /**
     * 서버가 아직 안 준다 — 모델이 써야 하는 글인데 키가 없다. 화면 구조를
     * 보려고 개발 빌드에서만 가짜를 끼운다. 배포에서는 그냥 없는 값이다.
     */
    primer: __DEV__ ? samplePrimer() : undefined,
  };
}

const DEFAULT_SPINE = ['#8E9AAF', '#5C6784'] as const;

export const booksKey = ['books'] as const;

export function useBooks() {
  return useQuery({
    queryKey: booksKey,
    queryFn: async () => (await api<ApiBook[]>('/books')).map(toBook),
  });
}

export function useBook(id?: string) {
  return useQuery({
    queryKey: ['books', id],
    enabled: Boolean(id),
    queryFn: async () => toBook(await api<ApiBook>(`/books/${id}`)),
  });
}

/**
 * 읽고 있는 책들. 맨 앞은 **핀이 꽂힌 책** — 고정한 책이 있으면 그 책, 없으면
 * 가장 최근에 **등록한** 책이다. 나머지는 가장 최근에 편 것부터.
 *
 * 맨 위 자리는 읽을 때마다 바뀌지 않는다. 한때 가장 최근에 읽은 책이 섰는데,
 * 두 권을 번갈아 읽으면 홈을 열 때마다 맨 위가 뒤바뀌었다. 핀은 늘 한 권에
 * 꽂혀 있다 — 고정한 책이 없어도 새로 들인 책이 그 자리를 맡고(그래서 그 책에도
 * 핀이 보인다), 다른 책에 핀을 꽂으면 그리로 옮겨 간다.
 */
export function useReadingBooks() {
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

/** 맨 위에 크게 서는 한 권 — 핀이 꽂힌 책(`useReadingBooks` 참고) */
export function useCurrentBook() {
  const query = useReadingBooks();
  return { ...query, data: query.data ? (query.data[0] ?? null) : undefined };
}

function byLastRead(a: ApiBook, b: ApiBook): number {
  return time(b.lastReadAt ?? b.startedAt) - time(a.lastReadAt ?? a.startedAt);
}

function time(iso?: string): number {
  return iso ? new Date(iso).getTime() : 0;
}

/**
 * 책을 서가에 들인다. 책등 색은 제목에서 정해 함께 보낸다 — 검색으로 찾아
 * 표지가 있어도 색은 함께 보낸다. 표지를 못 받아오는 순간에도(주소가 죽거나
 * 오프라인이거나) 출처를 말하는 일을 이 색이 대신해야 하기 때문이다.
 */
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
      /** 등록할 때 적은 '지금 몇 쪽'도 오늘 읽은 것으로 남는다 — 그래프가 알아야 한다 */
      client.invalidateQueries({ queryKey: ['reading'] });
    },
  });
}

/**
 * 책을 고친다 — 제목·지은이·쪽수·장르·지금 몇 쪽, 그리고 홈 고정.
 * '지금 몇 쪽'을 앞으로 옮기면 그 차이가 오늘 읽은 양으로 남으므로 그래프도 낡는다.
 */
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

/**
 * 책을 지운다. 서버가 그 책의 문장·그 책에서만 만난 표현·읽은 기록까지 함께
 * 지우므로, 서랍·표현·그래프가 전부 낡는다.
 */
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

export type BookSearchResult = {
  title: string;
  author: string;
  pages?: number;
  cover?: string;
  publisher?: string;
  /** 검색은 장르를 주지 않아 늘 비어 온다. 등록 화면에서 고른다. */
  genre?: Genre;
};

/**
 * 책을 검색한다. 서버가 외부 API를 대신 불러준다 — 키를 앱에 박지 않고,
 * CORS도 앱이 신경 쓸 일이 아니게 된다.
 */
export function useBookSearch(query: string) {
  return useQuery({
    queryKey: ['books', 'search', query],
    /** 한글은 한 음절도 완결된 단어일 수 있다(예: "눈" → 눈의 여왕) — 빈 문자열만 막는다 */
    enabled: query.trim().length > 0,
    queryFn: () =>
      api<BookSearchResult[]>(
        `/books/search?q=${encodeURIComponent(query.trim())}`,
      ),
    /** 같은 말을 다시 치면 캐시로 즉시 보여준다 — 검색은 왔다 갔다 하는 화면이다 */
    staleTime: 60_000,
  });
}
