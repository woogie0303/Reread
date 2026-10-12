import { StyleSheet, View } from 'react-native';

import { CoverThumb } from '@/entities/book/ui/cover-thumb';
import { color, type } from '@/shared/config';
import { AppText, Quote, Tap } from '@/shared/ui';
import { markSegments } from '../lib/segments';
import type { SentenceCardData } from '../model/types';

/**
 * 서랍의 한 줄 — 문장 하나(ADR-0004).
 *
 * **훑어보는 줄이다.** 뜻·표현·재회는 눌러서 들어간 문장 화면(`app/sentence/[id]`)이
 * 보여준다. 예전에는 이 카드 안에서 번역이 펼쳐지고, 밑줄을 누르면 표현 뜻이 또
 * 펼쳐지고, 거기서 한 번 더 눌러야 재회로 갔다 — 한 줄이 세 겹으로 접혔고, 이 앱만의
 * 기능인 재회가 가장 깊이 숨어 있었다.
 *
 * 그래서 여기엔 **한국어가 없다.** 문장과 그 안의 밑줄, 어느 책인지만 서고,
 * 몇 번 만났는지는 부르는 쪽이 청할 때만(`showMet`) 적는다. 물어봤는지 같은 상태는 적지 않는다 — 서랍의 갈래 이름이
 * 이미 말하고 있다. 답을 기다리는 문장은 서랍 목록에 서지 않는다
 * (`useSentenceFeed`가 따로 돌려준다).
 *
 * 출처는 표지로 보인다. 표지가 없는 책(직접 적은 책, 표지 없는 검색 결과)은
 * `BookCover`가 책 읽는 캐릭터로 채운다. 책 화면 안에서는(`inBook`) 출처를 적지 않는다.
 */
export function SentenceCard({
  data,
  onOpen,
  showMet,
  inBook = false,
}: {
  data: SentenceCardData;
  onOpen?: (sentenceId: string) => void;
  /** 'N번 만남'을 적을지 — 서랍에서는 '다시 만난 표현' 갈래에서만 뜻이 있다 */
  showMet?: boolean;
  /**
   * 책 화면 안의 목록인지. 그러면 표지도 책 이름도 적지 않는다 — 모든 줄에 같은 책이
   * 서면 출처를 알려주지도 못하면서 문장 읽을 폭만 줄인다. 쪽수와 담은 날은 남긴다.
   */
  inBook?: boolean;
}) {
  const segments = markSegments(data.text, data.marks);
  /** 이 문장의 표현 중 가장 많이 만난 것 — 재회는 목록에서도 한눈에 보여야 한다 */
  const met = Math.max(0, ...data.marks.map((mark) => mark.met ?? 0));

  return (
    <Tap
      style={styles.card}
      onPress={() => onOpen?.(data.id)}
      accessibilityRole="button"
      accessibilityLabel={data.text}
      accessibilityHint="눌러서 뜻과 표현 보기"
    >
      {data.book && !inBook ? <CoverThumb book={data.book} /> : null}

      <View style={styles.body}>
        <Quote numberOfLines={4} style={styles.sentence}>
          {segments.map((seg, i) =>
            seg.mark ? (
              <Quote key={i} style={styles.marked}>
                {seg.text}
              </Quote>
            ) : (
              <Quote key={i}>{seg.text}</Quote>
            ),
          )}
        </Quote>

        <View style={styles.foot}>
          <AppText numberOfLines={1} style={styles.source}>
            {[
              inBook ? null : (data.book?.title ?? '어느 책'),
              data.page ? `p.${data.page}` : null,
              data.savedLabel,
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>

          {showMet && met > 1 ? (
            <AppText style={styles.again}>{met}번 만남</AppText>
          ) : null}
        </View>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: color.surface.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
  },
  body: { flex: 1, minWidth: 0, gap: 9 },

  /** 책에서 온 글이라 세리프. 이 화면에서 눈이 멈춰야 하는 곳이다. */
  sentence: { fontSize: 16, lineHeight: 25, color: color.text.primary },
  /** 밑줄 하나가 '여기 담아둔 것이 있다'는 말을 대신한다 */
  marked: {
    color: color.primary,
    textDecorationLine: 'underline',
    textDecorationColor: color.primaryLine,
  },

  foot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  source: { flex: 1, ...type.caption2, color: color.text.meta },
  again: { ...type.caption2, fontWeight: '700', color: color.primary },
});
