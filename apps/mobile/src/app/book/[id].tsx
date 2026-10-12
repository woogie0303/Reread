import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useBook,
  useCurrentBook,
  useDeleteBook,
  useUpdateBook,
} from '@/entities/book/api/book.api';
import { color, gutter, type } from '@/shared/config';
import {
  AppText,
  DisclosureRow,
  MoreIcon,
  OptionSheet,
  PinIcon,
  ScreenHeader,
  Tap,
  TrashIcon,
} from '@/shared/ui';
import { useOpenScan } from '@/widgets/capture/lib/use-open-scan';
import { BookDetail } from '@/widgets/book-detail/ui/book-detail';
import type { BookTab } from '@/widgets/book-detail/ui/book-tabs';
import { BookActions } from '@/widgets/book-hero/ui/book-hero';

/** 책 한 권의 기록 — 홈이나 서랍의 출처 표시에서 들어온다. */
export default function BookScreen() {
  /** tab — 방금 담은 곳을 펴서 보여줄 때 넘어온다(예: 촬영에서 '마음에 든 문장') */
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: BookTab }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openScan = useOpenScan();
  const { data: book, isPending } = useBook(id);
  const { data: reading } = useCurrentBook();
  const remove = useDeleteBook();
  const update = useUpdateBook(id);

  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * 핀은 늘 한 권에 꽂혀 있다 — 고정한 책, 없으면 가장 최근에 등록한 책
   * (`useReadingBooks`). 그래서 이 책에 핀이 꽂혔는지는 서버의 `pinned`가 아니라
   * 홈 맨 위에 선 책이 이 책인지로 본다. 누르는 즉시 꽂힌 것처럼 보인다.
   */
  const pinned =
    (update.isPending && update.variables?.pinned) || reading?.book.id === id;

  /**
   * 압정 — 누르면 이 책을 홈 맨 위에 고정한다(다른 책의 고정은 풀린다). 이미 꽂힌
   * 책에서는 누를 수 없다 — 핀은 뽑는 게 아니라 다른 책으로 옮기는 것이다.
   * 한동안 ⋮ 안에 '홈 고정 풀기'로 있었는데, 지금 고정됐는지가 메뉴를 열어야 보였다.
   */
  const togglePin = () => {
    if (!book || pinned || update.isPending) return;
    update.mutate(
      { pinned: true },
      {
        onError: (error) =>
          Alert.alert(
            '바꾸지 못했어요',
            error instanceof Error ? error.message : '',
          ),
      },
    );
  };

  /**
   * ⋮에서 고른 일은 시트가 내려간 뒤에 한다. 시트가 내려가는 중에 확인 창이나
   * 다음 화면을 띄우면 iOS가 겹친 창을 받아주지 않아 그냥 사라진다.
   */
  const afterSheet = (run: () => void) => {
    setMenuOpen(false);
    setTimeout(run, 280);
  };

  /**
   * 되돌릴 수 없고 딸린 것이 많아서 한 번 묻는다 — 무엇이 함께 사라지는지
   * 이름을 대서 말한다. 붉은 버튼은 확인 창에서만 쓴다(문장 지우기와 같다).
   */
  const confirmDelete = () => {
    if (!book || remove.isPending) return;
    Alert.alert(
      '이 책을 지울까요?',
      `「${book.title}」에서 담은 문장, 이 책에서만 만난 표현, 읽은 쪽수 기록이 함께 사라져요.`,
      [
        { text: '그대로 둘게요', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(book.id);
              router.back();
            } catch (error) {
              Alert.alert(
                '지우지 못했어요',
                error instanceof Error ? error.message : '',
              );
            }
          },
        },
      ],
    );
  };
  /** 지금 읽는 책이면 읽기 기록 쪽 값이 가장 새롭다 */
  const page =
    (reading?.book.id === id ? reading?.progress.currentPage : undefined) ??
    book?.currentPage ??
    0;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        leading="back"
        onLeadingPress={() => router.back()}
        title="책"
        trailing={
          book ? (
            <View style={styles.actions}>
              <Tap
                hitSlop={8}
                onPress={togglePin}
                disabled={pinned}
                accessibilityRole="button"
                accessibilityState={{ selected: pinned, disabled: pinned }}
                accessibilityLabel={
                  pinned ? '홈 맨 위에 고정된 책' : '홈에 고정하기'
                }
              >
                <PinIcon
                  size={22}
                  filled={pinned}
                  color={pinned ? color.primary : color.text.primary}
                />
              </Tap>
              <Tap
                hitSlop={8}
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="이 책 더 보기 — 수정, 삭제"
              >
                <MoreIcon size={22} color={color.text.primary} />
              </Tap>
            </View>
          ) : undefined
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.scroll}
      >
        {isPending ? (
          <ActivityIndicator
            style={styles.spinner}
            color={color.text.assistive}
          />
        ) : book ? (
          <BookDetail
            book={book}
            initialTab={tab}
            /*
              진도는 지금 읽는 책만의 것이 아니다 — 어느 책이든 막대가 서고,
              누르면 기록한다. 아직 안 편 책은 빈 막대가 기록할 자리다.
            */
            progress={{
              bookId: book.id,
              currentPage: page,
              totalPages: book.pages ?? 0,
            }}
            onOpenSentence={(sentenceId, liked) =>
              /* 서랍과 같다 — 어느 갈래에서 열었는지가 문장 화면의 지우기 모양을 정한다 */
              router.push({
                pathname: '/sentence/[id]',
                params: liked
                  ? { id: sentenceId, from: 'liked' }
                  : { id: sentenceId },
              })
            }
            onPressProgress={() =>
              router.push({
                pathname: '/progress',
                params: { bookId: book.id },
              })
            }
          />
        ) : (
          <AppText style={styles.missing}>그 책을 찾지 못했어요.</AppText>
        )}
      </ScrollView>

      {/*
        주된 행동은 엄지가 닿는 아래에 고정한다 — 담은 표현을 훑어 내려간 뒤에도 다시
        올라가지 않고 찍는다. 지금 읽는 책이 아니어도 찍고 물을 수 있어야 한다 — 두 권을
        번갈아 읽기도 하고, 예전 책을 다시 펴기도 한다. 어느 책에 담을지는 bookId가 정한다.
      */}
      {book ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          <BookActions
            stretch
            onCapture={() => openScan(book.id)}
            onAsk={() =>
              router.push({ pathname: '/ask', params: { bookId: book.id } })
            }
          />
        </View>
      ) : null}

      {/* ⋮ — 책 추가와 같은 시트. 자주 쓰지 않는 일이라 머리에 아이콘 하나로 접어 둔다. */}
      <OptionSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <DisclosureRow
          icon="write"
          title="책 수정하기"
          body="제목·쪽수·장르가 책과 다르면 여기서 맞춰요."
          onPress={() =>
            afterSheet(() =>
              router.push({ pathname: '/book-edit', params: { id } }),
            )
          }
        />
        <DisclosureRow
          icon={<TrashIcon size={19} color={color.text.primary} />}
          title="책 삭제하기"
          body="담은 문장과 읽은 기록도 함께 지워져요. 한 번 더 물어봐요."
          onPress={() => afterSheet(confirmDelete)}
        />
      </OptionSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: 32 },
  bar: {
    paddingHorizontal: gutter,
    paddingTop: 12,
    backgroundColor: color.surface.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border.hairline,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  spinner: { paddingTop: 40 },
  missing: {
    ...type.label1,
    color: color.text.secondary,
    paddingTop: 40,
    textAlign: 'center',
  },
});
