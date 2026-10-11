import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSentenceFeed } from '@/entities/sentence/api/feed.api';
import { color, gutter, type } from '@/shared/config';
import { AppText, Icon, SearchField, Tap } from '@/shared/ui';
import { DrawerList } from '@/widgets/drawer/ui/drawer-list';

/**
 * 서랍 — 담아둔 문장이 모이는 곳(ADR-0004).
 *
 * 문장이 주인이고 표현은 그 안의 밑줄이다. 머리에 적는 수도 그래서 문장 수다 —
 * 예전에는 표현 수를 셌는데, 목록에 선 것과 세어 보여주는 것이 다르면 둘 중
 * 어느 쪽이 서랍인지 알 수 없어진다.
 */
export default function DrawerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { feed, waiting: waitingRows } = useSentenceFeed();
  /** 답을 기다리는 문장 — 목록엔 없고, 할 일이라 서랍 위에서 말을 건다 */
  const waiting = waitingRows.length;
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const closeSearch = () => {
    setSearching(false);
    setQuery('');
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        {searching ? (
          <SearchField
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="문장이나 뜻으로 찾기"
            style={styles.searchField}
          />
        ) : (
          <View style={styles.headText}>
            <AppText style={styles.title}>서랍</AppText>
            <AppText style={styles.summary}>문장 {feed.length}개</AppText>
          </View>
        )}
        <Tap
          hitSlop={12}
          onPress={() => (searching ? closeSearch() : setSearching(true))}
          accessibilityRole="button"
          accessibilityLabel={searching ? '검색 닫기' : '문장 검색'}
        >
          <Icon
            name={searching ? 'close' : 'search'}
            size={21}
            color={color.text.primary}
          />
        </Tap>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.scroll}
      >
        {/*
          기다리는 문장은 오류가 아니라 상태다(ADR-0003). 그래서 경고처럼
          붉게 세우지 않고, 여기서 이어서 할 수 있는 일로만 알린다.
        */}
        {waiting > 0 && !query ? (
          <Tap
            style={styles.waiting}
            onPress={() => router.push('/pending')}
            accessibilityRole="button"
            accessibilityLabel={`답을 기다리는 문장 ${waiting}개 보기`}
          >
            <Icon name="clock" size={15} color={color.primary} />
            <AppText style={styles.waitingText}>
              문장 {waiting}개가 답을 기다리고 있어요
            </AppText>
            <Icon name="chevronRight" size={14} color={color.primary} />
          </Tap>
        ) : null}

        <DrawerList
          query={query}
          onOpen={(id, liked) =>
            router.push({
              pathname: '/sentence/[id]',
              params: liked ? { id, from: 'liked' } : { id },
            })
          }
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  /**
   * 왼쪽 글 덩어리가 두 줄이어도 오른쪽 아이콘은 그 가운데에 선다.
   * 좌우 여백은 아래 목록과 같다 — 제목만 다른 선에서 시작하면 머리와 몸이
   * 서로 다른 화면처럼 보인다.
   */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingBottom: 14,
    gap: 12,
  },
  headText: { flex: 1, gap: 4 },
  title: { ...type.title3, color: color.text.primary },
  summary: { ...type.label2, color: color.text.meta },
  searchField: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: 24, gap: 12 },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: color.primaryBg,
  },
  waitingText: {
    flex: 1,
    ...type.label2,
    fontWeight: '600',
    color: color.primary,
  },
});
