import { StyleSheet, View } from 'react-native';

import type { Book } from '@/entities/book/model/types';
import { BookCover } from '@/entities/book/ui/book-cover';
import type { ReadingProgress } from '@/entities/reading/model/types';
import { color, shadow, type } from '@/shared/config';
import {
  AppText,
  CameraIcon,
  Chip,
  Icon,
  ProgressBar,
  Quote,
  Tap,
  emphasis,
} from '@/shared/ui';

/**
 * 책 한 권을 크게 세우는 판. 홈의 '읽고 있는 책'과 책 화면의 머리가 이걸
 * 함께 쓴다 — 같은 책을 두 화면에서 다르게 그리면 같은 책으로 보이지 않는다.
 *
 * 화면 높이에 억지로 맞추지 않는다. 채울 내용이 없는데 판만 늘리면
 * 그만큼이 빈자리로 남는다 — 내용이 정하는 높이가 곧 이 판의 높이다.
 *
 * 진도와 버튼은 넘겨받았을 때만 그린다. 책 화면은 아직 안 편 책에도 빈 막대를
 * 넘긴다 — 눌러서 기록할 자리가 있어야 해서다.
 */
export function BookHero({
  book,
  progress,
  inset = 20,
  onPressBook,
  onPressProgress,
  onAsk,
  onCapture,
}: {
  book: Book;
  progress?: ReadingProgress;
  /** 좌우 여백. 이미 여백을 가진 화면 안에 놓일 때는 0을 준다. */
  inset?: number;
  onPressBook?: () => void;
  /** 읽은 데까지 표시를 옮기는 자리 — 진도 막대 자체가 그 버튼이다 */
  onPressProgress?: () => void;
  onAsk?: () => void;
  onCapture?: () => void;
}) {
  /**
   * 쪽수를 모르는 책이 있다 — 손으로 들인 책은 쪽수가 선택이다. 그때
   * `totalPages`가 0이라 나누면 Infinity가 되고, 막대는 `NaN%`로, 글은
   * 'p.50 / 0 · Infinity%'로 그려졌다. 비율은 쪽수를 아는 책에만 있다.
   */
  const measured = Boolean(progress && progress.totalPages > 0);
  const ratio =
    progress && measured ? progress.currentPage / progress.totalPages : 0;
  const actionable = Boolean(onAsk || onCapture);
  /**
   * 진도 줄에 세울 것이 있는가. 쪽수도 읽은 쪽도 없으면 줄째 그리지 않는다 — 빈 칸을
   * 두면 판의 간격과 칸의 여백이 남아 표지 아래가 휑하게 벌어졌다.
   */
  const hasProgress = progress
    ? measured || progress.currentPage > 0
    : Boolean(book.pages);

  return (
    <View style={[styles.panel, { paddingHorizontal: inset }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Tap
            onPress={onPressBook}
            style={styles.titleBlock}
            accessibilityRole={onPressBook ? 'button' : undefined}
            accessibilityLabel={`${book.pinned ? '홈에 고정한 책, ' : ''}${book.title}, ${book.author}`}
          >
            <Quote style={styles.title}>{book.title}</Quote>
            <AppText style={styles.author}>{book.author}</AppText>
          </Tap>

          {/*
            이 앱이 하는 일이 여기 있다 — 읽던 쪽을 찍어 막힌 문장을 묻는 것.
            한동안 19px 아이콘 둘로 나란히 서 있었는데, 제품의 본 동작이 화면에서
            가장 작고 이름 없는 것이 되어 있었다. 찍기에 이름을 주고, 손으로 적는
            길은 그 곁의 아이콘으로 물러난다 — 둘은 같은 무게가 아니다.
          */}
          {actionable ? (
            <BookActions onCapture={onCapture} onAsk={onAsk} />
          ) : null}
        </View>

        {/* 제목이 이미 같은 곳으로 데려가므로, 표지는 읽어주지 않는다 */}
        <Tap
          onPress={onPressBook}
          style={styles.coverTap}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <BookCover book={book} width={130} height={200} radius={10} />
        </Tap>
      </View>

      {/* 막대가 곧 기록 버튼이다 — 누를 만큼 굵게 둔다 */}
      {hasProgress ? (
        <Tap
          style={styles.progress}
          onPress={onPressProgress}
          disabled={!onPressProgress}
          accessibilityRole={onPressProgress ? 'button' : undefined}
          accessibilityHint={onPressProgress ? '읽은 쪽 기록하기' : undefined}
          accessibilityLabel={
            progress && measured
              ? `${progress.totalPages}쪽 중 ${progress.currentPage}쪽까지 읽었어요`
              : progress && progress.currentPage > 0
                ? `${progress.currentPage}쪽까지 읽었어요`
                : undefined
          }
        >
          {progress && measured ? (
            <>
              <ProgressBar value={ratio} height={8} />
              {/*
              값이 라벨보다 먼저 읽힌다 — 이 줄에서 알고 싶은 것은 '얼마나 읽었나'이고,
              쪽수는 그 근거다. 한동안 둘이 같은 크기·같은 옅은 색으로 붙어 있었다.
            */}
              <AppText style={styles.progressLabel}>
                <AppText style={emphasis()}>
                  {`${Math.round(ratio * 100)}%`}
                </AppText>
                {`  p.${progress.currentPage} / ${progress.totalPages}`}
                {progress.lastReadLabel ? ` · ${progress.lastReadLabel}` : ''}
              </AppText>
            </>
          ) : progress && progress.currentPage > 0 ? (
            /**
             * 전체 쪽수를 모르면 비율이 없다 — 읽은 쪽 하나만 사실로 세운다. 막대 없이
             * 글자로만 두면 진도 줄이 아니라 아무 숫자처럼 읽혀서 배지로 감싼다.
             */
            <View style={styles.pageRow}>
              <Chip label={`p.${progress.currentPage}`} tone="primary" />
              {progress.lastReadLabel ? (
                <AppText style={styles.progressLabel}>
                  {progress.lastReadLabel}
                </AppText>
              ) : null}
            </View>
          ) : (
            <AppText style={styles.progressLabel}>{`${book.pages}p`}</AppText>
          )}
        </Tap>
      ) : null}
    </View>
  );
}

/**
 * 이 앱이 하는 일 — 읽던 쪽을 찍어 막힌 문장을 묻는 것 — 과 그 곁의 손으로 적는 길.
 *
 * 홈에서는 머리 안에, 책 화면에서는 화면 아래 고정 바에 선다. 책 화면은 아래로
 * 길어지는 화면이라, 주된 행동이 맨 위에 있으면 담은 표현을 훑어 내려간 뒤 다시
 * 올라와야 찍을 수 있었다 — 엄지가 닿는 자리에 두면 어디까지 내려가 있든 바로 찍는다.
 * `stretch`면 찍기 버튼이 남는 폭을 다 가져간다.
 */
export function BookActions({
  onCapture,
  onAsk,
  stretch = false,
}: {
  onCapture?: () => void;
  onAsk?: () => void;
  stretch?: boolean;
}) {
  return (
    <View style={[styles.actions, stretch ? styles.actionsStretch : null]}>
      <Tap
        style={[styles.capture, stretch ? styles.captureStretch : null]}
        onPress={onCapture}
        accessibilityRole="button"
        accessibilityLabel="읽던 쪽 찍기"
      >
        <CameraIcon size={18} color={color.text.onInk} />
        <AppText style={styles.captureLabel}>읽던 쪽 찍기</AppText>
      </Tap>
      <Tap
        style={[styles.write, stretch ? styles.writeStretch : null]}
        onPress={onAsk}
        accessibilityRole="button"
        accessibilityLabel="문장 적어서 묻기"
      >
        <Icon name="write" size={17} color={color.primary} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  /** 화면 높이에 맞추지 않는다 — 내용만큼만 쓴다. 아래 여백은 쓰는 쪽이 정한다. */
  panel: { gap: 20 },

  /**
   * 왼쪽 칸을 표지 높이만큼 늘리고, 그 안에서 제목은 위·버튼은 아래로 벌린다.
   * 표지의 윗변·밑변과 글이 같은 선에서 만나 네모 하나로 읽힌다.
   */
  row: { flexDirection: 'row', gap: 16, alignItems: 'stretch' },
  left: { flex: 1, minWidth: 0, alignSelf: 'flex-end', gap: 16 },
  /** 표지는 제 높이(200)만 쓴다 — stretch에 딸려 늘어나지 않게 못 박는다 */
  coverTap: { alignSelf: 'flex-start' },
  titleBlock: { gap: 4 },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  pinnedLabel: { ...type.caption2, fontWeight: '700', color: color.primary },
  title: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '600',
    color: color.text.primary,
    letterSpacing: -0.3,
  },
  author: { ...type.label2, color: color.text.secondary },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
  },
  /** 이름이 붙은 쪽이 주된 행동이다 */
  capture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: color.primary,
    ...shadow.primary,
  },
  captureLabel: { ...type.label2, fontWeight: '700', color: color.text.onInk },
  /** 곁의 길 — 찍을 수 없을 때 손으로 적는다 */
  write: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: color.primaryTint,
  },
  actionsStretch: { alignSelf: 'stretch' },
  captureStretch: { flex: 1, justifyContent: 'center', height: 52 },
  writeStretch: { width: 52, height: 52 },

  /** 막대 위아래로 손가락이 닿을 자리를 준다 — 8pt 막대만으로는 누르기 어렵다 */
  progress: { gap: 8, paddingVertical: 4 },
  progressLabel: { ...type.label2, color: color.text.meta },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
