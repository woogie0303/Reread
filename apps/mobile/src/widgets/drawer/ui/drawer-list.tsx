import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useSentenceFeed } from '@/entities/sentence/api/feed.api';
import { SentenceCard } from '@/entities/sentence/ui/sentence-card';
import { color, type } from '@/shared/config';
import {
  ActionButton,
  AppText,
  CameraIcon,
  EmptyState,
  Tap,
} from '@/shared/ui';
import {
  DRAWER_MATCH,
  DrawerFilterRow,
  type DrawerFilter,
} from './drawer-filter';

const EMPTY: Record<DrawerFilter, string> = {
  liked: '아직 마음에 들어 담아둔 문장이 없어요',
  items: '아직 표현을 담은 문장이 없어요',
  again: '아직 같은 표현을 두 번 만난 적이 없어요',
};

/**
 * 서랍 — 담아둔 문장이 시간순으로 쌓인다(ADR-0004).
 *
 * 항목이 아니라 문장이 한 줄씩 선다. 표현은 문장 안의 밑줄이다. 줄을 누르면 그
 * 문장 화면으로 가고, 뜻·표현·재회는 거기서 본다 — 목록은 훑어보는 자리다.
 *
 * 거르는 일은 앞에서 한다. 갈래가 전부 같은 목록을 다르게 보는 것뿐이라,
 * 갈래를 바꿀 때마다 서버에 다시 물어보면 이미 손에 있는 걸 또 받는 셈이다.
 */
export function DrawerList({
  query,
  onOpen,
  onCapture,
}: {
  /** 검색어 — 문장이나 번역에 들어 있으면 남긴다. 갈래와 함께 걸린다. */
  query?: string;
  /** liked — '마음에 들었던 문장' 갈래에서 눌렀는지. 문장 화면이 그걸 보고 모양을 고른다. */
  onOpen?: (sentenceId: string, liked: boolean) => void;
  /** 아직 아무것도 없을 때 빈자리에서 바로 찍으러 간다 */
  onCapture?: () => void;
}) {
  const [picked, setPicked] = useState<DrawerFilter>();
  const { feed, isPending, error, hasMore, loadingMore, loadMore } =
    useSentenceFeed();

  /**
   * 고르기 전에는 표현이 담긴 쪽을 먼저 편다 — 서랍의 요지가 거기 있다. 다만
   * 아직 담은 표현이 하나도 없으면 빈 갈래를 먼저 보이지 않고 문장 쪽을 편다.
   */
  const filter: DrawerFilter =
    picked ??
    (feed.some(DRAWER_MATCH.items) || !feed.length ? 'items' : 'liked');
  const byFilter = feed.filter(DRAWER_MATCH[filter]);
  const needle = query?.trim().toLowerCase();
  /** 번역까지 뒤지는 이유 — 영어가 기억 안 날 때 한국어로 찾는 길은 있어야 한다 */
  const rows = needle
    ? byFilter.filter(
        (s) =>
          s.text.toLowerCase().includes(needle) ||
          s.translation?.toLowerCase().includes(needle) ||
          s.marks.some((m) => m.term.toLowerCase().includes(needle)),
      )
    : byFilter;

  return (
    <View style={styles.wrap}>
      <DrawerFilterRow
        value={filter}
        onChange={setPicked}
        count={byFilter.length}
      />

      {isPending ? (
        <ActivityIndicator
          style={styles.spinner}
          color={color.text.assistive}
        />
      ) : error ? (
        <EmptyState
          mark="blocked"
          title="목록을 불러오지 못했어요"
          body={error.message}
        />
      ) : rows.length ? (
        <View style={styles.list}>
          {rows.map((row) => (
            <SentenceCard
              key={row.id}
              data={row}
              onOpen={(id) => onOpen?.(id, filter === 'liked')}
              showMet={filter === 'again'}
            />
          ))}

          {/*
            서버가 한 번에 내주는 만큼만 받아온다 — 예전에는 전 기록이 한
            응답에 실려 왔고, 오래 쓴 독자에서 가장 먼저 깨질 자리였다.
            갈래는 손에 있는 것만 걸러 보여주는 것이라, '더 보기'는 모든
            갈래에 줄을 더 가져온다. 검색 중에는 숨긴다.
          */}
          {hasMore && !needle ? (
            <Tap
              style={styles.more}
              onPress={loadMore}
              disabled={loadingMore}
              accessibilityRole="button"
              accessibilityLabel="문장 더 보기"
              accessibilityState={{ busy: loadingMore }}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={color.text.meta} />
              ) : (
                <AppText style={styles.moreLabel}>더 보기</AppText>
              )}
            </Tap>
          ) : null}
        </View>
      ) : (
        <EmptyState
          mark={needle ? 'not-found' : 'empty'}
          title={
            needle
              ? `'${query}'와 맞는 문장이 없어요`
              : feed.length
                ? EMPTY[filter]
                : '아직 담아둔 문장이 없어요'
          }
          body={
            needle || feed.length
              ? undefined
              : '읽다 막힌 쪽을 찍어서 문장을 담아보세요.'
          }
          action={
            !needle && !feed.length && onCapture ? (
              <ActionButton
                label="읽던 쪽 찍기"
                icon={<CameraIcon size={18} color={color.text.onInk} />}
                onPress={onCapture}
              />
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  list: { gap: 10 },
  spinner: { paddingTop: 40 },
  more: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fill.default,
    marginTop: 2,
  },
  moreLabel: { ...type.label2, fontWeight: '600', color: color.text.secondary },
});
