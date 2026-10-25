import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { api, Unauthenticated } from '@/shared/api/client';
import { clearReminder } from '@/shared/notifications/reminder';
import { clearTokens, readTokens, saveTokens } from '@/shared/api/tokens';
import type {
  ProviderName,
  ReaderView,
  SignInResult,
} from '@/shared/api/types';
import { readLastProvider, saveLastProvider } from './last-provider';
import {
  anonymousSignIn,
  reviewSignIn as doReviewSignIn,
  signInWith,
} from './oauth';

type Status = 'loading' | 'in' | 'out';

type Session = {
  status: Status;
  reader: ReaderView | null;
  /** 들어오지 못한 이유 — 로그인 화면이 그대로 보여준다 */
  problem: string | null;
  /**
   * 이번 실행이 저장된 세션 없이 시작했다 — 처음 깐 기기거나 로그아웃한 뒤다. 첫 실행
   * 안내는 이때만 고른다. 이미 쓰던 독자가 업데이트했다고 안내를 내밀면 방해가 된다.
   */
  fresh: boolean;
  signIn: (provider: ProviderName) => Promise<void>;
  reviewSignIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/**
 * 지금 쓰는 사람 하나. 화면은 이걸 통해서만 '지금 누구인지'를 안다.
 *
 * 앱을 열 때 저장된 토큰으로 한 번 물어본다. 토큰이 살아 있으면 그대로 들어가고, 죽었으면
 * 지운다 — 만료된 토큰을 들고 앱을 돌아다니다 화면마다 하나씩 실패하는 것보다 문 앞에서
 * 한 번 확인하는 게 낫다.
 *
 * **토큰이 없으면 로그인 없이 들인다**(익명 독자). 무엇을 하는 앱인지 써 보기도 전에
 * 로그인을 요구하면 거기서 돌아선다. 질문 몫이 작을 뿐 나머지는 같고, 나중에 로그인하면
 * 익명으로 쌓은 기록이 그 계정으로 옮겨진다(서버 `ReaderMergeService`). 다만 이 기기에서
 * 한 번이라도 로그인했으면 익명으로 들이지 않고 로그인 화면을 보인다
 * (`last-provider.ts`) — 원래 계정과 따로 노는 기록이 생기지 않게.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [reader, setReader] = useState<ReaderView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const queryClient = useQueryClient();

  const enter = useCallback(
    async (result: SignInResult) => {
      await saveTokens(result);
      /**
       * 캐시는 독자 하나만 안다는 전제로 쌓인다(쿼리 키에 독자 id가 없다).
       * 비우지 않으면 방금 로그아웃한 사람의 책·서랍이 새로 들어온 사람
       * 화면에 그대로 남는다 — 서버는 매번 옳게 답해도 화면이 그걸 무시하고
       * 캐시부터 보여주기 때문이다. 익명에서 로그인으로 넘어갈 때도 비운다 —
       * 합쳐진 기록을 서버에서 다시 받아야 한다.
       */
      queryClient.clear();
      setReader(result.reader);
      setProblem(null);
      setStatus('in');
    },
    [queryClient],
  );

  const fail = useCallback((error: unknown) => {
    setProblem(
      error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
    );
    setStatus('out');
  }, []);

  /**
   * 들어갈 길을 고른다. 저장된 토큰이 있으면 그걸로 먼저 들어가고, 죽었으면 지운다.
   * 서버에 닿지 못한 것뿐이면 토큰을 지킨다. `anonymous`일 때만 익명으로 들어간다.
   */
  const open = useCallback(
    async (anonymous: boolean) => {
      const stored = await readTokens();
      if (stored) {
        try {
          setReader(await api<ReaderView>('/auth/me'));
          setProblem(null);
          setStatus('in');
          return;
        } catch (error) {
          /** 서버에 닿지 못한 것뿐이면 토큰을 지키고 로그인 화면에서 이유를 보인다 */
          if (!(error instanceof Unauthenticated)) {
            fail(error);
            return;
          }
          /** 토큰이 죽었거나 서버가 모르는 독자다 — 지우고 새로 들어온다 */
          await clearTokens();
        }
      }

      if (!anonymous) {
        setStatus('out');
        return;
      }
      try {
        await enter(await anonymousSignIn());
      } catch (error) {
        fail(error);
      }
    },
    [enter, fail],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      /**
       * 상태가 'loading'을 벗어나기 전에 정한다 — 문(`Gate`)이 그 순간 안내를 띄울지
       * 고르는데, 그때 이 값이 아직 없으면 처음 온 기기에서 안내를 건너뛴다.
       */
      const [stored, last] = await Promise.all([
        readTokens(),
        readLastProvider(),
      ]);
      if (!alive) return;
      setFresh(!stored);
      /** 이 기기에서 로그인한 적이 있으면 익명으로 들이지 않고 로그인 화면을 보인다 */
      await open(!last);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const value = useMemo<Session>(
    () => ({
      status,
      reader,
      problem,
      fresh,
      signIn: async (provider) => {
        await enter(await signInWith(provider));
        await saveLastProvider(provider);
      },
      reviewSignIn: async (username, password) =>
        enter(await doReviewSignIn(username, password)),
      signOut: async () => {
        /** 남의 계정으로 알림이 울리지 않게 — 예약과 설정을 먼저 지운다 */
        await clearReminder();
        const stored = await readTokens();
        if (stored) {
          /** 서버에서도 끊는다. 실패해도 기기에서는 지운다. */
          await api('/auth/logout', {
            method: 'POST',
            anonymous: true,
            body: { refreshToken: stored.refresh },
          }).catch(() => undefined);
        }
        await clearTokens();
        queryClient.clear();
        setReader(null);
        setStatus('out');
      },
    }),
    [status, reader, problem, fresh, enter, queryClient],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider 안에서만 쓸 수 있어요.');
  return session;
}
