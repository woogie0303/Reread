import { useCallback, useMemo, useRef, useState } from 'react';

import { showToast } from '@/shared/ui';
import {
  groupBySentence,
  indicesOf,
  overflows,
  rangesOf,
  toggleRange,
  without,
  limitMessage,
  type Limit,
  type Range,
} from './selection';

type Word = { text: string };

/**
 * 고른 표현들. 사진 위에서든 손으로 적은 글 위에서든 같은 상태를 쓴다.
 *
 * 고른 것은 **단어 번호의 범위 목록** 하나뿐이다. 한 범위가 한 표현이다 — 누르면 단어
 * 하나짜리 범위, 끌면 지나간 만큼의 범위. 이웃해 있다고 합치지 않는다. 문장은 거기서
 * 매번 계산한다(`groupBySentence`) — 따로 들고 있으면 표현 하나를 빼는 순간 문장 목록과
 * 어긋난다.
 *
 * 한 번에 물을 수 있는 것을 넘기는 변화(`overflows`)는 받지 않고, 막혔다는 것만
 * `limit`(이유와 시각)으로 알린다 — 화면이 그 시각이 바뀔 때마다 배지를 흔든다.
 *
 * `whole`이면 글 전체를 한 문장으로 묻는다 — 담아둔 문장을 다시 물을 때가 그렇다.
 */
export function usePicks(words: Word[], { whole = false } = {}) {
  const [ranges, setRanges] = useState<Range[]>([]);
  const [limit, setLimit] = useState<{ reason: Limit; at: number } | null>(
    null,
  );

  /** 어느 단어가 골라져 있는가 — 칠하는 쪽이 본다 */
  const selected = useMemo(() => indicesOf(ranges), [ranges]);
  const groups = useMemo(() => groupBySentence(words, ranges), [words, ranges]);

  /** 끌다가 같은 말을 매 순간 하지 않게 — 알림은 잠깐 간격을 둔다 */
  const toastedAt = useRef(0);

  /** 통째로 바꾼다 — 끄는 동안 매 순간 이 길로 온다. 받았으면 true. */
  const change = useCallback(
    (next: Range[]) => {
      const tidy = rangesOf(next);
      const reason = overflows(words, tidy, { whole });
      /** 같은 단어를 또 고른 것은 잠깐만 알린다 — 아무것도 고르지 못한 때에도 보여야 한다 */
      if (reason === 'duplicate') {
        const now = Date.now();
        if (now - toastedAt.current > 1500) {
          toastedAt.current = now;
          showToast(limitMessage(reason));
        }
        return false;
      }
      if (reason) {
        setLimit({ reason, at: Date.now() });
        return false;
      }
      setRanges(tidy);
      /** 다시 고를 수 있게 되었으니 막혔다는 말은 거둔다 */
      setLimit(null);
      return true;
    },
    [words, whole],
  );

  /** 단어 하나를 눌렀을 때 — 스크린리더의 누르기도 이 길이다 */
  const toggle = useCallback(
    (index: number) => change(toggleRange(ranges, index)),
    [ranges, change],
  );

  /** 표현 하나를 통째로 뺀다 — 시트의 칩에서 */
  const unpick = useCallback((from: number, to: number) => {
    setRanges((prev) => without(prev, from, to));
  }, []);

  const clear = useCallback(() => setRanges([]), []);

  return { ranges, selected, groups, change, toggle, unpick, clear, limit };
}
