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
import { prepareSocialSignIn, reviewSignIn as doReviewSignIn, signInWith } from './oauth';

type Status = 'loading' | 'in' | 'out';

type Session = {
  status: Status;
  reader: ReaderView | null;
  /** 들어오지 못한 이유 — 로그인 화면이 그대로 보여준다 */
  problem: string | null;
  signIn: (provider: ProviderName) => Promise<void>;
  reviewSignIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/**
 * 로그인한 사람 하나. 화면은 이걸 통해서만 '지금 누구인지'를 안다.
 *
 * 앱을 열 때 저장된 토큰으로 한 번 물어본다. 토큰이 살아 있으면 로그인 화면을
 * 건너뛰고, 죽었으면 지우고 로그인으로 보낸다 — 만료된 토큰을 들고 앱을
 * 돌아다니다 화면마다 하나씩 실패하는 것보다 문 앞에서 한 번 확인하는 게 낫다.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [reader, setReader] = useState<ReaderView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const enter = useCallback(
    async (result: SignInResult) => {
      await saveTokens(result);
      /**
       * 캐시는 독자 하나만 안다는 전제로 쌓인다(쿼리 키에 독자 id가 없다).
       * 비우지 않으면 방금 로그아웃한 사람의 책·서랍이 새로 들어온 사람
       * 화면에 그대로 남는다 — 서버는 매번 옳게 답해도 화면이 그걸 무시하고
       * 캐시부터 보여주기 때문이다.
       */
      queryClient.clear();
      setReader(result.reader);
      setProblem(null);
      setStatus('in');
    },
    [queryClient],
  );

  useEffect(() => {
    let alive = true;

    /**
     * 소셜 SDK는 쓰기 전에 깨워둬야 한다 — 버튼을 누른 뒤에 초기화하면
     * 첫 번째 누름이 조용히 실패한다.
     */
    prepareSocialSignIn();

    (async () => {
      const stored = await readTokens();

      if (stored) {
        try {
          const me = await api<ReaderView>('/auth/me');
          if (!alive) return;
          setReader(me);
          setStatus('in');
          return;
        } catch (error) {
          /** 토큰이 죽었거나 서버가 모르는 독자다. 둘 다 다시 로그인이 답이다. */
          if (error instanceof Unauthenticated) await clearTokens();
          if (!alive) return;
        }
      }

      if (alive) setStatus('out');
    })();

    return () => {
      alive = false;
    };
  }, [enter]);

  const value = useMemo<Session>(
    () => ({
      status,
      reader,
      problem,
      signIn: async (provider) => enter(await signInWith(provider)),
      reviewSignIn: async (username, password) => enter(await doReviewSignIn(username, password)),
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
    [status, reader, problem, enter, queryClient],
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
