import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type {
  GenreShare,
  ReadingCalendarDay,
  ReadingWeek,
} from '../model/types';
import { readingKey } from './keys';

type ApiGenreStat = { genre: string; pages: number };

type ApiWeek = {
  days: { date: string; pages: number }[];
  daysRead: number;
  streak: number;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function useGetReadingWeek() {
  return useQuery({
    queryKey: [...readingKey, 'week'],
    queryFn: async (): Promise<ReadingWeek> => {
      const week = await api<ApiWeek>('/reading/week');
      const most = Math.max(1, ...week.days.map((day) => day.pages));
      const total = week.days.reduce((sum, day) => sum + day.pages, 0);
      const monthLabel = `${new Date().getMonth() + 1}월`;
      const today = new Date().toDateString();

      return {
        monthLabel,
        days: week.daysRead,
        pages: total,
        streak: week.streak,
        bars: week.days.map((day) => {
          const date = new Date(day.date);
          const isToday = date.toDateString() === today;
          return {
            label: isToday ? '오늘' : WEEKDAYS[date.getDay()],
            amount: day.pages / most,
            pages: day.pages,
            today: isToday,
          };
        }),
      };
    },
  });
}

export function useGetGenreStats() {
  return useQuery({
    queryKey: [...readingKey, 'genres'],
    queryFn: async (): Promise<GenreShare[]> => {
      const rows = await api<ApiGenreStat[]>('/reading/genres');
      const total = rows.reduce((sum, row) => sum + row.pages, 0);
      const [known, unknown] = partition(
        rows,
        (row) => row.genre !== '장르 없음',
      );
      return [...known, ...unknown].map((row) => ({
        genre: row.genre,
        pages: row.pages,
        ratio: total > 0 ? row.pages / total : 0,
      }));
    },
  });
}

function partition<T>(items: T[], test: (item: T) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  for (const item of items) (test(item) ? yes : no).push(item);
  return [yes, no];
}

export function useGetReadingRange() {
  return useQuery({
    queryKey: [...readingKey, 'range'],
    queryFn: async () => {
      const range = await api<{ first: string; last: string }>(
        '/reading/range',
      );
      const first = new Date(range.first);
      const last = new Date(range.last);
      return {
        first: { year: first.getFullYear(), month: first.getMonth() + 1 },
        last: { year: last.getFullYear(), month: last.getMonth() + 1 },
      };
    },
  });
}

export function useGetReadingMonth(year: number, month: number) {
  return useQuery({
    queryKey: [...readingKey, 'days', year, month],
    queryFn: async (): Promise<ReadingCalendarDay[]> => {
      const rows = await api<{ date: string; pages: number }[]>(
        `/reading/days?year=${year}&month=${month}`,
      );
      return rows.map((row) => ({
        date: new Date(row.date),
        pages: row.pages,
      }));
    },
  });
}

