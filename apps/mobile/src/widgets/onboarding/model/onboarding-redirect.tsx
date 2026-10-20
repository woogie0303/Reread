import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useGetBooks } from '@/entities/book/api/book.api';
import { useSession } from '@/shared/session/session';
import { hasSeenOnboarding } from './seen';

/**
 * 처음 온 독자를 안내 화면으로 보낸다. 로그인한 뒤에만 그려야 한다(`useBooks`가 서버를
 * 부른다) — 그래서 훅이 아니라 컴포넌트다.
 *
 * **책이 한 권도 없고 아직 안 본 독자에게만** 보여준다. 이미 책을 담아 쓰는 독자는 이 앱을
 * 아는 사람이라, 업데이트했다고 안내를 내밀면 방해가 된다. 한 번 판단하면 다시 따지지
 * 않는다 — 안내를 마치고 돌아온 뒤 책 목록이 바뀌어도 또 불러내지 않으려고.
 */
export function OnboardingRedirect() {
  const router = useRouter();
  const { reader } = useSession();
  const { data: books } = useGetBooks();
  const [seen, setSeen] = useState<boolean | null>(null);
  const decided = useRef(false);

  useEffect(() => {
    if (!reader) return;
    let live = true;
    hasSeenOnboarding(reader.id).then((value) => {
      if (live) setSeen(value);
    });
    return () => {
      live = false;
    };
  }, [reader]);

  useEffect(() => {
    if (decided.current || seen === null || !books) return;
    decided.current = true;
    if (!seen && books.length === 0) router.push('/onboarding');
  }, [seen, books, router]);

  return null;
}
