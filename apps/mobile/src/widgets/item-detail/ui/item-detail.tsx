import { StyleSheet, View } from 'react-native';

import { toBook } from '@/entities/book/api/book.api';
import { CoverThumb } from '@/entities/book/ui/cover-thumb';
import { markSegments } from '@/entities/sentence/lib/segments';
import type { ApiItemDetail } from '@/shared/api/types';
import { color, type } from '@/shared/config';
import { daysBetween, gapLabel, savedLabel } from '@/shared/lib/date';
import {
  AltPanel,
  AppText,
  Card,
  Checkbox,
  Icon,
  Quote,
  Tap,
  emphasis,
} from '@/shared/ui';

/**
 * 항목 하나의 전부. 위에는 뜻, 아래에는 이걸 만난 문장들이 시간순으로 선다 —
 * 두 번 이상 만난 항목에서는 그 사이의 간격이 화면의 주인공이다.
 */
export function ItemDetail({
  detail,
  twinTerm,
  onOpenItem,
  onOpenSentence,
  selection,
}: {
  detail: ApiItemDetail;
  /** 헷갈리는 짝의 표제형. 짝이 있을 때만 따로 받아온다. */
  twinTerm?: string;
  onOpenItem?: (id: string) => void;
  /** 만난 문장을 누르면 서랍에서 누른 것과 같은 문장 화면으로 간다 */
  onOpenSentence?: (sentenceId: string) => void;
  /**
   * 지울 문장을 고르는 중이면 있다. 줄 앞에 체크 칸이 서고, 줄을 누르면 문장 화면으로
   * 가는 대신 체크가 바뀐다.
   */
  selection?: {
    selected: ReadonlySet<string>;
    onToggle: (sentenceId: string) => void;
    onToggleAll: () => void;
  };
}) {
  const { item } = detail;
  /** 문장을 못 찾은 만남은 그릴 것이 없다 */
  const encounters = detail.encounters.flatMap((met) =>
    met.sentence && met.book
      ? [{ ...met, sentence: met.sentence, book: met.book }]
      : [],
  );
  const books = uniqueBooks(encounters.map((met) => met.book));
  /**
   * 문장마다 이 표현이 나타난 꼴 — 서랍·홈과 같은 밑줄을 긋는다. 같은 표현도 문장마다
   * 꼴이 달라서(made out / make out) 문장 id로 찾는다. 한동안 이 화면만 밑줄이 없어서,
   * 긴 문장에서는 표현이 어디 있는지 다시 찾아 읽어야 했다.
   */
  const surfaceOf = new Map(
    item.encounters.flatMap((met) =>
      met.surface ? [[met.sentenceId, met.surface] as const] : [],
    ),
  );
  const gap =
    encounters.length > 1
      ? gapLabel(
          daysBetween(
            encounters[0].savedAt,
            encounters[encounters.length - 1].savedAt,
          ),
        )
      : undefined;

  return (
    <View style={styles.wrap}>
      <Card style={styles.hero}>
        <Quote style={styles.term}>{item.term}</Quote>
        <AppText style={styles.meaning}>{item.meaning}</AppText>
        {gap ? (
          <View style={styles.gapRow}>
            <Icon name="clock" size={14} color={color.primary} />
            {/* 한글은 단어 단위로 줄을 바꾼다 — 기본값은 '만났어/요'처럼 단어 가운데서 끊는다 */}
            <AppText style={styles.gapText} lineBreakStrategyIOS="hangul-word">
              {books.length > 1 ? `${books.length}권에서 ` : ''}
              {encounters.length}번 만났어요 — 처음 담은 뒤{' '}
              <AppText style={emphasis(color.primary)}>{gap}</AppText> 다시
              만났어요
            </AppText>
          </View>
        ) : null}
      </Card>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <AppText style={styles.sectionTitle}>만난 문장</AppText>
          {selection ? (
            <Tap
              hitSlop={10}
              onPress={selection.onToggleAll}
              accessibilityRole="button"
            >
              <AppText style={styles.all}>
                {selection.selected.size === encounters.length
                  ? '선택 해제'
                  : '전체 선택'}
              </AppText>
            </Tap>
          ) : null}
        </View>
        {encounters.map((encounter) => {
          const checked = selection?.selected.has(encounter.sentenceId);
          return (
            <Tap
              key={encounter.sentenceId}
              style={[styles.card, checked ? styles.cardChecked : null]}
              onPress={() =>
                selection
                  ? selection.onToggle(encounter.sentenceId)
                  : onOpenSentence?.(encounter.sentenceId)
              }
              accessibilityRole={selection ? 'checkbox' : 'button'}
              accessibilityState={
                selection ? { checked: Boolean(checked) } : undefined
              }
              accessibilityLabel={encounter.sentence.text}
              accessibilityHint={
                selection
                  ? '눌러서 지울 문장으로 고르기'
                  : '눌러서 이 문장 보기'
              }
            >
              {selection ? (
                <View style={styles.check}>
                  <Checkbox checked={Boolean(checked)} />
                </View>
              ) : null}
              <CoverThumb book={toBook(encounter.book)} style={styles.thumb} />
              <View style={styles.cardBody}>
                <Quote style={styles.sentence}>
                  {markSegments(
                    encounter.sentence.text,
                    surfaceOf.has(encounter.sentenceId)
                      ? [
                          {
                            surface: surfaceOf.get(encounter.sentenceId)!,
                            term: item.term,
                            meaning: item.meaning,
                          },
                        ]
                      : [],
                  ).map((seg, i) =>
                    seg.mark ? (
                      <Quote key={i} style={styles.marked}>
                        {seg.text}
                      </Quote>
                    ) : (
                      <Quote key={i}>{seg.text}</Quote>
                    ),
                  )}
                </Quote>
                <AppText style={styles.source}>
                  {[
                    encounter.book.title,
                    encounter.sentence.page
                      ? `p.${encounter.sentence.page}`
                      : null,
                    savedLabel(encounter.savedAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
                {encounter.sentence.note ? (
                  <AppText style={styles.note}>
                    {encounter.sentence.note}
                  </AppText>
                ) : null}
              </View>
            </Tap>
          );
        })}
      </View>

      {twinTerm && item.confusedWith ? (
        <Tap onPress={() => onOpenItem?.(item.confusedWith!.itemId)}>
          <AltPanel style={styles.twin}>
            <View style={styles.twinHead}>
              <Quote style={styles.twinTerm}>{twinTerm}</Quote>
              <AppText style={styles.twinLabel}>와는 이렇게 달라요</AppText>
              <Icon
                name="chevronRight"
                size={14}
                color={color.text.assistive}
              />
            </View>
            <AppText style={styles.twinNote}>{item.confusedWith.note}</AppText>
          </AltPanel>
        </Tap>
      ) : null}
    </View>
  );
}

/** 같은 책을 두 번 그리지 않는다 */
function uniqueBooks<T extends { _id: string }>(books: T[]): T[] {
  const seen = new Map<string, T>();
  for (const book of books) seen.set(book._id, book);
  return [...seen.values()];
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },

  hero: { padding: 22, gap: 12 },
  term: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600',
    color: color.text.primary,
  },
  meaning: { ...type.body2, color: color.text.body },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: color.primaryTint,
  },
  gapText: {
    flex: 1,
    ...type.caption1,
    lineHeight: 17,
    color: color.text.body,
  },

  section: { gap: 10 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  all: { ...type.label2, fontWeight: '600', color: color.primary },
  /** 고른 줄은 잉크색 테두리 대신 포인트색 테두리 — 지금 고른 것만 파랗다는 규칙 */
  cardChecked: { borderColor: color.primary, borderWidth: 1.5 },
  check: { justifyContent: 'center', paddingLeft: 14 },
  sectionTitle: { ...type.body2, fontWeight: '700', color: color.text.primary },
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: color.surface.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
    overflow: 'hidden',
  },
  thumb: { marginTop: 14, marginLeft: 14 },
  cardBody: {
    flex: 1,
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: 0,
  },
  sentence: { fontSize: 15, lineHeight: 23, color: color.text.primary },
  /** 서랍의 밑줄과 같다 — 같은 표현이 화면마다 다르게 칠해지면 같은 표현으로 안 보인다 */
  marked: {
    color: color.primary,
    textDecorationLine: 'underline',
    textDecorationColor: color.primaryLine,
  },
  source: { ...type.caption2, color: color.text.meta },
  note: { ...type.caption1, color: color.text.secondary, marginTop: 2 },

  twin: { padding: 16, gap: 8 },
  twinHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  twinTerm: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: color.text.primary,
  },
  twinLabel: {
    flex: 1,
    ...type.label2,
    fontWeight: '700',
    color: color.text.primary,
  },
  twinNote: { ...type.label2, lineHeight: 21, color: color.text.secondary },
});
