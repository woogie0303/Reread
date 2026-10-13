import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { color, family, type } from '@/shared/config';
import { locate, WORD } from '@/shared/ocr/selection';
import { AppText, Icon, Quote, Tap } from '@/shared/ui';

/** 시트에 서는 문장 하나 — 글과, 그 안에서 고른 표현들 */
export type SheetSentence = {
  key: string;
  text: string;
  picks: {
    surface: string;
    /** 고친 문장에서 사라졌는지 — 묻기 전에 빼거나 문장을 고쳐야 한다 */
    missing: boolean;
    /**
     * 사진 위 단어 번호 — 칩을 빼면 그 단어들의 고르기가 풀린다. 시트에서 글자를 눌러
     * 고른 표현은 사진에 매이지 않아서 둘 다 -1이다.
     */
    from: number;
    to: number;
  }[];
};

type SheetPick = SheetSentence['picks'][number];

/**
 * 물어볼 문장 카드. 글의 **단어를 누르면 그 단어가 한 표현으로 골라진다** — 이미 고른
 * 표현의 글자를 누르면 그 표현이 풀린다. 사진 위에서 짚지 못한 단어(글자 인식이 단어를
 * 쪼갰을 때)도 여기서 고른다.
 *
 * 글자 인식은 틀린다(단어가 빠지거나 줄 끝 하이픈이 남는다). 모서리의 연필을 누르면
 * 바로 고치는 칸이 열리고, 다른 곳을 누르면 닫힌다. 길게 누르기는 쓰지 않는다 — iOS의 글자 선택이 떠서 어수선하다. 안내 글은 두지 않는다 —
 * 화면이 글로 어수선해지는 쪽이 더 나빴다.
 *
 * 아래 칩은 고른 표현들이다. ✕로 빼면 사진 위의 고르기도 함께 풀린다(사진에서 고른 것만).
 * 문장을 고치다 표현이 사라졌으면 칩이 주의 색이 되고 묻기가 막힌다 — 문장에 없는 표현을
 * 물으면 모델이 문장 밖의 뜻을 지어낸다.
 */
export function AskSentence({
  sentence,
  index,
  onChangeText,
  onTogglePick,
  onRemovePick,
  onEditing,
}: {
  sentence: SheetSentence;
  /** 몇 번째 카드인지 — 하나씩 차례로 올라온다 */
  index: number;
  onChangeText: (next: string) => void;
  /** 글의 단어 하나를 눌렀다 — 고르지 않은 단어면 새 표현이 된다 */
  onTogglePick: (surface: string) => void;
  onRemovePick: (pick: SheetPick) => void;
  /** 글을 고치는 중인지 — 시트가 쪽수·버튼을 자판 위로 올리지 않으려고 안다 */
  onEditing?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  /** 고치는 중이라는 것을 시트에 알린다 — 카드가 사라지면서 고치는 중이었다면 거둔다 */
  useEffect(() => {
    if (!editing) return;
    onEditing?.(true);
    return () => onEditing?.(false);
  }, [editing, onEditing]);
  const missing = sentence.picks.some((pick) => pick.missing);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 4) * 50).duration(220)}
      style={styles.card}
    >
      {editing ? (
        <TextInput
          value={sentence.text}
          onChangeText={onChangeText}
          onBlur={() => setEditing(false)}
          autoFocus
          multiline
          scrollEnabled={false}
          accessibilityLabel="물어볼 문장 고치기"
          style={[styles.sentence, styles.editing]}
        />
      ) : (
        <Quote style={[styles.sentence, styles.readonly]}>
          {partsOf(
            sentence.text,
            sentence.picks.map((pick) => pick.surface),
          ).map((part, i) =>
            part.word ? (
              <Quote
                key={i}
                onPress={() =>
                  part.on
                    ? onRemovePick(sentence.picks[part.owner])
                    : onTogglePick(part.text)
                }
                accessibilityRole="button"
                accessibilityHint={
                  part.on ? '눌러서 빼기' : '모르는 단어로 고르기'
                }
                style={part.on ? styles.marked : null}
              >
                {part.text}
              </Quote>
            ) : (
              <Quote key={i} style={part.on ? styles.marked : null}>
                {part.text}
              </Quote>
            ),
          )}
        </Quote>
      )}

      {editing ? null : (
        <Tap
          onPress={() => setEditing(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="글자 고치기"
          style={styles.pencil}
        >
          <Icon name="write" size={14} color={color.text.assistive} />
        </Tap>
      )}

      <View style={styles.chips}>
        {sentence.picks.map((pick) => (
          <View
            key={`${pick.from}-${pick.to}-${pick.surface}`}
            style={[styles.chip, pick.missing ? styles.chipMissing : null]}
          >
            <Quote
              style={[
                styles.chipText,
                pick.missing ? styles.chipTextMissing : null,
              ]}
            >
              {pick.surface}
            </Quote>
            <Tap
              hitSlop={10}
              onPress={() => onRemovePick(pick)}
              accessibilityRole="button"
              accessibilityLabel={`${pick.surface} 빼기`}
            >
              <Icon
                name="close"
                size={12}
                color={pick.missing ? color.status.cautionary : color.primary}
              />
            </Tap>
          </View>
        ))}
      </View>

      {missing ? (
        <AppText style={styles.hint}>
          문장에 없는 표현이 있어요. 빼거나 문장을 고쳐 주세요.
        </AppText>
      ) : null}
    </Animated.View>
  );
}

type Part = {
  text: string;
  /** 단어인가(누를 수 있다) — 공백과 부호는 아니다 */
  word: boolean;
  /** 고른 표현이 덮은 글자인가 */
  on: boolean;
  /** 덮은 표현이 `picks`의 몇 번째인가. 덮이지 않았으면 -1 */
  owner: number;
};

/**
 * 글을 단어와 그 사이(공백·부호)로 나눈다. 고른 표현이 문장에서 선 자리(`locate`)는 `on`이다 —
 * 여러 단어짜리 표현이면 사이의 공백까지 덮는다.
 */
function partsOf(text: string, surfaces: string[]): Part[] {
  const owner: number[] = new Array(text.length).fill(-1);
  surfaces.forEach((surface, i) => {
    const at = locate(text, surface);
    if (!at) return;
    for (let k = at.from; k < at.to; k += 1) if (owner[k] < 0) owner[k] = i;
  });

  const out: Part[] = [];
  const push = (from: number, to: number, word: boolean) => {
    if (to <= from) return;
    const who = owner[from];
    out.push({
      text: text.slice(from, to),
      word,
      on: who >= 0 && owner[to - 1] === who,
      owner: who,
    });
  };

  let cursor = 0;
  for (const match of text.matchAll(WORD)) {
    const from = match.index ?? 0;
    push(cursor, from, false);
    push(from, from + match[0].length, true);
    cursor = from + match[0].length;
  }
  push(cursor, text.length, false);
  return out;
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: color.surface.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
  },
  /** 책의 글이라 고치는 중에도 세리프다 */
  sentence: {
    fontFamily: family.serif,
    fontSize: 17,
    lineHeight: 27,
    color: color.text.primary,
  },
  editing: {
    padding: 8,
    margin: -8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.strong,
    textAlignVertical: 'top',
  },
  marked: {
    color: color.primary,
    textDecorationLine: 'underline',
    textDecorationColor: color.primaryLine,
  },

  /** 모서리의 연필이 글을 가리지 않게 오른쪽을 비운다 */
  readonly: { paddingRight: 22 },
  pencil: { position: 'absolute', top: 14, right: 14 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    /** 긴 구는 칩 안에서 줄을 바꾼다 — 칸을 넘으면 ✕가 밀려 나간다 */
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 10,
    paddingRight: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: color.primaryTint,
  },
  chipMissing: { backgroundColor: color.fill.default },
  chipText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    color: color.primary,
  },
  chipTextMissing: {
    color: color.status.cautionary,
    textDecorationLine: 'line-through',
  },
  hint: { ...type.caption1, color: color.status.cautionary },
});
