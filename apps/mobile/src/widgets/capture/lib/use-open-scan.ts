import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * 촬영 화면을 여는 단 하나의 길. 광고는 없다 — 읽던 쪽을 찍는 순간은 읽는 흐름의 한가운데라
 * 거기에 광고를 끼우지 않는다(ADR-0003). 한때 여기서 전면 광고를 한 번 보였다.
 *
 * `replace`는 직접 적는 화면에서 사진으로 바꿔 탈 때 — 그 화면을 쌓아 두지 않는다.
 */
export function useOpenScan() {
  const router = useRouter();

  return useCallback(
    (bookId?: string, options?: { replace?: boolean }) => {
      const href = bookId
        ? ({ pathname: '/scan', params: { bookId } } as const)
        : '/scan';
      if (options?.replace) router.replace(href);
      else router.push(href);
    },
    [router],
  );
}
