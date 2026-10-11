import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useBookSearch,
  type BookSearchResult,
} from '@/entities/book/api/book.api';
import { spineFor } from '@/entities/book/lib/spine';
import { BookCover } from '@/entities/book/ui/book-cover';
import { color, gutter, type } from '@/shared/config';
import { EmptyState } from '@/shared/ui/empty-state';
import {
  ActionButton,
  AppText,
  ScreenHeader,
  SearchField,
  Tap,
} from '@/shared/ui';

/**
 * 제목이나 지은이로 찾는다. 서버가 대신 불러오므로 앱에는 검색 키가 없다.
 *
 * 고른 결과를 바로 등록하지 않고 손 입력 화면으로 값을 채워 넘긴다 — 검색
 * 결과의 쪽수나 저자 표기가 어긋날 때가 있고, 그 화면에서 한 번 눈으로 보고
 * 고칠 수 있어야 한다.
 */
export default function BookSearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  /**
   * 입력이 멈추고 0.4초 뒤에만 묻는다. 글자마다 물으면 「Klara and the Sun」 하나에
   * 요청이 열다섯 번 나가는데, 검색하는 곳(Open Library)의 한도는 사용자마다가 아니라
   * 우리 서버 전체에 초당 한 건이다.
   */
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), 400);
    return () => clearTimeout(timer);
  }, [query]);
  const typing = query.trim() !== settled.trim();
  const { data: results, isFetching, isError } = useBookSearch(settled);
  const busy = typing || isFetching;

  const pick = (book: BookSearchResult) =>
    router.replace({
      pathname: '/book-add',
      params: {
        title: book.title,
        author: book.author,
        pages: book.pages ? String(book.pages) : undefined,
        cover: book.cover,
        genre: book.genre,
      },
    });

  /** 찾던 제목을 그대로 채워 넘긴다 — 방금 친 걸 다시 치게 하지 않는다 */
  const manual = () =>
    router.replace({ pathname: '/book-add', params: { title: query.trim() } });

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        leading="back"
        onLeadingPress={() => router.back()}
        title="책 검색하기"
      />

      <SearchField
        value={query}
        onChangeText={setQuery}
        autoFocus
        placeholder="제목이나 지은이"
        style={styles.field}
        trailing={
          busy && query.trim().length > 0 ? (
            <ActivityIndicator size="small" color={color.text.assistive} />
          ) : null
        }
      />

      <FlatList
        data={results ?? []}
        keyExtractor={(item, i) => `${item.title}-${item.author}-${i}`}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.trim().length === 0 || busy ? null : (
            /**
             * 검색이 막힌 것과 책이 없는 것을 다르게 말한다. 막힌 걸 "없어요"로
             * 말하면 독자는 제목을 잘못 친 줄 알고 몇 번이고 다시 친다.
             */
            <View style={styles.empty}>
              {isError ? (
                <EmptyState
                  mark="blocked"
                  title="책 검색이 잠시 막혔어요"
                  body="잠시 뒤에 다시 찾아보시거나, 직접 입력해 주세요."
                />
              ) : (
                <EmptyState
                  mark="no-results"
                  title="찾는 책이 없어요"
                  body="원문 제목이나 지은이 영문 표기로 다시 찾아보세요."
                />
              )}
              <ActionButton
                label="직접 입력하기"
                variant="subtle"
                onPress={manual}
              />
            </View>
          )
        }
        renderItem={({ item }) => (
          <Tap style={styles.row} onPress={() => pick(item)}>
            <BookCover
              book={{
                id: 'preview',
                title: item.title,
                author: item.author,
                pages: item.pages ?? 0,
                cover: item.cover,
                spine: spineFor(item.title),
              }}
              width={44}
              height={64}
              radius={6}
            />
            <View style={styles.rowText}>
              <AppText numberOfLines={1} style={styles.rowTitle}>
                {item.title}
              </AppText>
              <AppText numberOfLines={1} style={styles.rowMeta}>
                {item.author}
                {item.publisher ? ` · ${item.publisher}` : ''}
              </AppText>
            </View>
          </Tap>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  field: { marginHorizontal: gutter, marginBottom: 8 },
  list: { paddingHorizontal: gutter, paddingBottom: 24, gap: 4 },
  empty: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  rowText: { flex: 1, gap: 3, minWidth: 0 },
  rowTitle: { ...type.label1, fontWeight: '600', color: color.text.primary },
  rowMeta: { ...type.caption1, color: color.text.meta },
});
