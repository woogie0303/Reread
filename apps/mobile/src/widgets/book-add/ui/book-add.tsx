import { StyleSheet, TextInput, View } from 'react-native';

import { draftBook } from '@/entities/book/lib/spine';
import { BookCover } from '@/entities/book/ui/book-cover';
import { GENRES, type Genre } from '@/entities/book/model/types';
import { color, shadow, type } from '@/shared/config';
import { AppText, Tap } from '@/shared/ui';

export type BookDraft = {
  title: string;
  author: string;
  pages: string;
  currentPage: string;
  /** 검색에서 골랐을 때만 있다. 손으로 입력하는 화면에서는 고칠 자리가 없다. */
  cover?: string;
  /** 검색은 장르를 주지 않으니 여기서 고른다. */
  genre?: Genre;
};

/**
 * 책을 손으로 들인다. 검색에서 골랐으면 값이 이미 채워져 있고, 검색에 없던
 * 책이면 여기서부터 적는다 — 어느 쪽이든 등록이 막히지 않는다. 제목·지은이·
 * 전체 쪽수가 있어야 시작할 수 있고, 지금 몇 쪽인지는 나중에 채워도 된다.
 *
 * 표지는 없어도 된다. 검색에서 온 표지가 없으면 제목에서 정한 책등 색이 그
 * 자리를 대신하고, 앞으로 담을 문장 카드들이 그 색을 물려받아 라벨 없이
 * 출처를 말한다.
 *
 * 전체 쪽수는 없어도 되는 값이 아니다 — 문장을 담을 쪽이 그 책 안에 있는지,
 * 진도가 몇 퍼센트인지가 전부 이 값에 기대고 있다. 검색 결과에 쪽수가 없으면
 * 빈 채로 넘어오므로 여기서 채워야 한다.
 *
 * 장르도 없어도 되는 값이 아니다 — '장르별로 얼마나 읽었는지' 그래프가 이
 * 값에 기댄다. 카카오·Open Library는 장르를 안 주니 비어 오고, 여기서 고른다.
 */
export function BookAdd({
  draft,
  onChange,
  tooFar,
  heading = '어떤 책을 읽고 계세요?',
  sub = '등록하면 이 책에서 모은 문장이 한곳에 쌓여요',
  focusTitle = true,
}: {
  draft: BookDraft;
  onChange: (next: BookDraft) => void;
  /** 등록과 고치기가 같은 폼을 쓴다 — 머리글만 다르다 */
  heading?: string;
  sub?: string;
  /** 등록할 땐 제목부터 적으니 자판을 바로 띄운다. 고칠 땐 무엇을 고칠지 몰라 띄우지 않는다. */
  focusTitle?: boolean;
  /** '지금 몇 쪽'이 전체 쪽수를 넘었다 — 등록 버튼이 흐려진 이유를 여기서 말한다 */
  tooFar?: boolean;
}) {
  const preview = {
    ...draftBook(draft.title, draft.author, Number(draft.pages) || undefined),
    cover: draft.cover,
  };
  const set = (key: keyof BookDraft) => (value: string) =>
    onChange({ ...draft, [key]: value });

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <AppText style={styles.question}>{heading}</AppText>
        <AppText style={styles.sub}>{sub}</AppText>
      </View>

      <View style={styles.row}>
        <BookCover
          book={preview}
          width={96}
          height={140}
          radius={12}
          style={shadow.cover}
        />

        <View style={styles.fields}>
          <Field
            label="제목"
            value={draft.title}
            onChangeText={set('title')}
            autoFocus={focusTitle}
          />
          <Field
            label="지은이"
            value={draft.author}
            onChangeText={set('author')}
          />
        </View>
      </View>

      <View style={styles.pages}>
        <Field
          label="전체 쪽수"
          value={draft.pages}
          onChangeText={set('pages')}
          keyboard
        />
        <Field
          label="지금 몇 쪽"
          value={draft.currentPage}
          onChangeText={set('currentPage')}
          keyboard
          optional
        />
      </View>
      {tooFar ? (
        <AppText style={styles.warn}>
          이 책은 {draft.pages}쪽까지예요. 그 안의 쪽수를 적어주세요.
        </AppText>
      ) : null}

      <View style={styles.genreBlock}>
        <AppText style={styles.label}>장르</AppText>
        <View style={styles.genreRow}>
          {GENRES.map((genre) => {
            const on = genre === draft.genre;
            return (
              <Tap
                key={genre}
                style={[styles.genreChip, on ? styles.genreChipOn : null]}
                onPress={() => onChange({ ...draft, genre })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <AppText
                  style={[styles.genreLabel, on ? styles.genreLabelOn : null]}
                >
                  {genre}
                </AppText>
              </Tap>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboard,
  optional,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboard?: boolean;
  optional?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>
        {label}
        {optional ? (
          <AppText style={styles.optional}> · 없어도 돼요</AppText>
        ) : null}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        keyboardType={keyboard ? 'number-pad' : 'default'}
        placeholderTextColor={color.text.assistive}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 22 },
  head: { gap: 6 },
  question: { ...type.title3, color: color.text.primary },
  sub: { ...type.label2, color: color.text.secondary },

  row: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  fields: { flex: 1, gap: 14, minWidth: 0 },
  pages: { flexDirection: 'row', gap: 12 },

  field: { flex: 1, gap: 5 },
  label: { ...type.caption1, color: color.text.meta },
  optional: { ...type.caption2, color: color.text.assistive },

  warn: { ...type.caption1, color: color.status.cautionary, marginTop: -12 },

  genreBlock: { gap: 10 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: color.fill.default,
  },
  genreChipOn: { backgroundColor: color.surface.ink },
  genreLabel: {
    ...type.label2,
    fontWeight: '600',
    color: color.text.secondary,
  },
  genreLabelOn: { color: color.text.onInk },
  /** 줄 하나로 받는다 — 상자를 두르면 폼이 화면의 주인공이 된다 */
  input: {
    ...type.body2,
    color: color.text.primary,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.default,
  },
});
