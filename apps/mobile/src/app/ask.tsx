import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAskQuota, useCreateAsk } from '@/entities/ask/api/ask.api';
import { explainAskError } from '@/entities/ask/lib/explain-error';
import { usagePercent } from '@/entities/ask/lib/quota';
import { useBook, useCurrentBook } from '@/entities/book/api/book.api';
import { useUpdateProgress } from '@/entities/reading/api/reading.api';
import {
  useCreateSentence,
  useSentence,
} from '@/entities/sentence/api/sentence.api';
import { color, gutter, type } from '@/shared/config';
import { limitMessage, surfaceOf, tokenize } from '@/shared/ocr/selection';
import { usePicks } from '@/shared/ocr/use-picks';
import {
  ActionButton,
  AppText,
  AskingOverlay,
  HeartIcon,
  ScreenHeader,
} from '@/shared/ui';
import { SentenceField } from '@/widgets/ask/ui/sentence-field';
import { WordPicker } from '@/widgets/ask/ui/word-picker';
import { useOpenScan } from '@/widgets/capture/lib/use-open-scan';

/**
 * 어느 책에 대고 묻는지는 들어온 길이 정한다. 홈의 ✎에서 오면 지금 읽는 책이고,
 * 책 화면에서 오면 그 책이다. `sentenceId`로 오면 **이미 담아둔 문장**을 묻는다 —
 * 글은 그 문장 그대로라 고칠 수 없고, 책과 쪽수도 그 문장이 안다.
 */
type Params = {
  bookId?: string;
  page?: string;
  text?: string;
  sentenceId?: string;
};

/**
 * 03 질문 — 막힌 문장을 적고, **그 안에서 모르는 단어를 골라** 묻는다.
 *
 * 적은 글은 아래에 단어로 다시 펼쳐지고, 거기서 사진 위에서처럼 누르거나 끌어서
 * 고른다. 무엇을 모르는지는 독자가 정한다 — 모델이 짐작해 골라 주던 때는 짐작이
 * 빗나간 문장이 아무것도 담기지 않은 채 남았다. 글을 고치면 고른 것은 풀린다
 * (단어 자리가 달라져서).
 *
 * 질문이 떨어졌거나 신호가 없으면 답만 미뤄질 뿐, 담는 일은 실패하지 않는다.
 * 읽던 흐름이 끊기는 것이 이 앱이 막으려는 바로 그 일이기 때문이다.
 */
export default function AskScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openScan = useOpenScan();

  const params = useLocalSearchParams<Params>();
  /** 담아둔 문장을 묻는 길 — 글은 그 문장 그대로다 */
  const saved = useSentence(params.sentenceId);
  const fixed = Boolean(params.sentenceId);
  /** 찍어온 쪽에서 고른 문장이 있으면 그걸로 시작한다 */
  const [typed, setTyped] = useState(params.text ?? '');
  const sentence = fixed ? (saved.data?.text ?? '') : typed;

  /**
   * 담아둔 문장은 글 전체가 한 문장이다 — 표현 수도 글 전체에서 센다. 새로 적은 글은
   * 사진과 같이 마침표로 문장을 나눈다 — 한 번에 여러 문장을 적었을 때 문장마다 묻는다.
   */
  const words = useMemo(() => tokenize(sentence), [sentence]);
  const picks = usePicks(words, { whole: fixed });
  const surfaces = (
    fixed
      ? picks.ranges.map((range) => surfaceOf(words, range.from, range.to))
      : picks.groups.flatMap((group) => group.picks.map((pick) => pick.surface))
  ).filter(Boolean);
  /** 고른 표현이 든 문장 수 — 담아둔 문장은 늘 한 문장이다 */
  const sentenceCount = fixed ? (surfaces.length ? 1 : 0) : picks.groups.length;
  const clearPicks = picks.clear;
  /** 글을 고치면 단어 자리가 바뀐다 — 고른 것을 풀어야 엉뚱한 단어가 칠해지지 않는다 */
  useEffect(() => clearPicks(), [sentence, clearPicks]);

  const { data: quota } = useAskQuota();
  const { data: current } = useCurrentBook();
  const { data: chosen } = useBook(params.bookId);
  const book = chosen ?? current?.book;
  /**
   * 쪽수는 꼭 적는다 — 나중에 이 문장을 다시 찾을 때 붙잡을 곳이 쪽수뿐이다.
   * 미리 채워 두지 않는다. 지난번 쪽이 들어 있으면 확인도 없이 그대로 담긴다.
   * 지난번 쪽은 진도를 뒤로 되돌리지 않는 데만 쓴다(`recordPage`).
   */
  const lastPage =
    (current?.book.id === book?.id
      ? current?.progress.currentPage
      : undefined) ??
    book?.currentPage ??
    0;
  const [pageEdit, setPageText] = useState<string | undefined>(params.page);
  const pageText = pageEdit ?? '';
  const typedPage = Number(pageText);
  /** 책에 없는 쪽은 쪽이 아니다 — 아래 글이 이유를 말하고, 서버도 한 번 더 막는다 */
  const tooFar = Boolean(book?.pages && typedPage > book.pages);
  const page = typedPage > 0 && !tooFar ? typedPage : undefined;
  /** 그냥 담기는 문장과 쪽수만, 묻기는 고른 표현까지 있어야 한다 */
  const ready = Boolean(book && sentence.trim() && page);
  const askable = fixed
    ? Boolean(saved.data && surfaces.length)
    : ready && surfaces.length > 0;
  const moveProgress = useUpdateProgress(book?.id ?? '');

  const createAsk = useCreateAsk();
  const keepSentence = useCreateSentence();

  const left = quota?.remaining ?? 0;

  /**
   * 문장을 적은 쪽까지는 읽은 것이다 — 담을 때 진도도 그만큼 옮긴다.
   * 앞으로만 간다: 예전 쪽을 다시 펴서 적었다고 진도가 뒤로 가면 안 된다.
   * 진도를 못 옮겨도 문장 담기는 실패가 아니다.
   */
  const recordPage = () => {
    if (!book || !page || page <= lastPage) return;
    moveProgress.mutate(page);
  };
  /**
   * 물어본다. 질문이 떨어졌거나 답을 못 받아도 실패가 아니다 — 서버가 문장을
   * 먼저 저장하고 pending으로 돌려준다(ADR-0003).
   *
   * 답은 이 모달에서 펴지 않고 그 문장이 사는 곳으로 간다. 답이 왔으면 문장 화면을
   * 뜻을 편 채로, 못 받았으면 기다리는 문장 목록으로. 촬영에서 물었을 때와 같은
   * 길이다 — 어디서 물었든 결과는 한 화면에서 본다.
   */
  const ask = async () => {
    if (!askable) return;
    try {
      const [view] = await createAsk.mutateAsync(
        fixed && params.sentenceId
          ? { sentenceId: params.sentenceId, picks: surfaces }
          : {
              bookId: book!.id,
              page,
              sentences: picks.groups.map((group) => ({
                text: group.text.trim(),
                picks: group.picks.map((pick) => pick.surface),
              })),
            },
      );
      if (!fixed) recordPage();
      if (view?.ask.status === 'answered' && view.sentence && fixed) {
        /**
         * 담아둔 문장을 다시 물었으면 그 문장 화면이 이미 이 모달 아래에 있다. 새로 쌓지
         * 않고 그리로 돌아간다 — 쌓으면 뒤로 가기에 묻기 전의 같은 문장이 한 번 더 나온다.
         */
        router.dismissTo({
          pathname: '/sentence/[id]',
          /** 묻을 때마다 다른 값 — 그 화면이 이미 reveal을 들고 있어도 뜻이 다시 펴진다 */
          params: { id: view.sentence._id, reveal: String(Date.now()) },
        });
      } else if (view?.ask.status === 'answered' && view.sentence) {
        router.replace({
          pathname: '/sentence/[id]',
          params: { id: view.sentence._id, reveal: '1' },
        });
      } else {
        router.replace('/pending');
      }
    } catch (error) {
      const failure = explainAskError(error);
      Alert.alert(failure.title, failure.message);
      /** 늦은 것일 뿐 문장은 담겨 있다 — 기다리는 문장으로 보낸다 */
      if (failure.saved) router.replace('/pending');
    }
  };

  /**
   * 뜻을 묻지 않고 문장만 남긴다. 담고 나면 그 책의 '마음에 들었던 문장'을 편다.
   * 질문 횟수도 쓰지 않는다 — 모델을 부르지 않으니까.
   */
  const keepOnly = async () => {
    if (!book || !sentence.trim() || !page) return;
    try {
      await keepSentence.mutateAsync({
        bookId: book.id,
        text: sentence.trim(),
        page,
      });
      recordPage();
      router.replace({
        pathname: '/book/[id]',
        params: { id: book.id, tab: 'liked' },
      });
    } catch (error) {
      Alert.alert('담지 못했어요', error instanceof Error ? error.message : '');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        leading="close"
        onLeadingPress={() => router.back()}
        title="질문"
        trailing={
          <AppText style={[styles.quota, left === 0 ? styles.quotaOut : null]}>
            이번 달 {usagePercent(quota?.ratio)}% 사용
          </AppText>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {fixed ? null : (
          <SentenceField
            value={typed}
            onChangeText={setTyped}
            onCapture={() => openScan(book?.id, { replace: true })}
            page={pageText}
            onChangePage={setPageText}
          />
        )}
        {/* 버튼이 흐려진 이유는 버튼이 아니라 여기가 말한다 */}
        {fixed ? null : tooFar ? (
          <AppText style={styles.needPage}>
            이 책은 {book?.pages}쪽까지예요.
          </AppText>
        ) : null}

        {words.length ? (
          <View style={styles.pick}>
            <AppText style={styles.pickTitle}>
              {surfaces.length
                ? `고른 표현 ${surfaces.length}개 · 문장 ${sentenceCount}개`
                : '모르는 단어를 누르세요'}
            </AppText>
            <AppText style={styles.pickHint}>
              {picks.limit && `${limitMessage(picks.limit.reason)}.`}
            </AppText>
            <WordPicker
              words={words}
              ranges={picks.ranges}
              selected={picks.selected}
              onChange={picks.change}
              onToggle={picks.toggle}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        {/* 질문 시트(`AskSheet`)와 같은 모양 — 넓은 쪽이 묻기, 좁은 쪽(하트)이 그냥 담기 */}
        <ActionButton
          label={left > 0 ? '이 문장 물어보기' : '문장만 담아두기'}
          variant={left > 0 ? 'primary' : 'ink'}
          disabled={!askable || keepSentence.isPending}
          loading={createAsk.isPending}
          onPress={ask}
          style={styles.main}
        />
        {/* 뜻은 몰라도 되고 그냥 좋았던 문장 — 이건 서랍이 아니라 책에 남는다. 이미 담은 문장에는 없다. */}
        {fixed ? null : (
          <ActionButton
            label="그냥 마음에 든 문장이에요"
            icon={<HeartIcon size={22} color={color.primary} />}
            iconOnly
            variant="subtle"
            disabled={!ready || createAsk.isPending}
            loading={keepSentence.isPending}
            onPress={keepOnly}
            style={styles.side}
          />
        )}
      </View>

      <AskingOverlay visible={createAsk.isPending} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  quota: { ...type.caption1, fontWeight: '600', color: color.text.meta },
  quotaOut: { color: color.status.cautionary },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: gutter,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 18,
  },

  needPage: { ...type.caption1, color: color.status.cautionary, marginTop: -8 },
  pick: { gap: 8 },
  pickTitle: { ...type.label1, fontWeight: '700', color: color.text.primary },
  pickHint: { ...type.caption1, color: color.text.meta, marginBottom: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingTop: 12,
    gap: 8,
  },
  main: { flex: 1 },
  side: { width: 56, height: 52 },
});
