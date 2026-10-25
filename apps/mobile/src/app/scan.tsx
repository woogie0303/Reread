import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGetAskQuota, usePostAsk } from '@/entities/ask/api/ask.api';
import { explainAskError } from '@/entities/ask/lib/explain-error';
import { useGetBook, useCurrentBook } from '@/entities/book/api/book.api';
import { usePatchProgress } from '@/entities/reading/api/reading.api';
import {
  isAnonymousLimit,
  offerSignIn,
} from '@/entities/sentence/lib/anonymous-limit';
import { usePostSentence } from '@/entities/sentence/api/sentence.api';
import { color, gutter, ink, type } from '@/shared/config';
import {
  followEdit,
  limitMessage,
  MAX_PICKS,
  MAX_PICK_CHARS,
  pickStillIn,
} from '@/shared/ocr/selection';
import {
  available,
  languagesFor,
  readLines,
  type OcrWord,
} from '@/shared/ocr/text-extractor';
import { usePicks } from '@/shared/ocr/use-picks';
import {
  ActionButton,
  AppText,
  AskingOverlay,
  HeaderAction,
  ScreenHeader,
  showToast,
  Tap,
} from '@/shared/ui';
import { AskSheet } from '@/widgets/capture/ui/ask-sheet';
import type { SheetSentence } from '@/widgets/capture/ui/ask-sentence';
import { PhotoPicker, type Shot } from '@/widgets/capture/ui/photo-picker';
import { PickBadge } from '@/widgets/capture/ui/pick-badge';

type Params = { bookId?: string };

/**
 * 촬영 — 읽던 쪽을 찍고, **그 쪽 위에서 모르는 단어를** 골라 묻는다.
 *
 * 단어를 누르거나 끌어서 고르면 아래에 배지가 떠서 고른 것이 쌓인다. 배지를 누르면
 * 고른 단어가 든 문장들이 시트로 올라오고, 거기서 한 번에 물을지 그냥 담을지 고른다.
 * 고르는 순간 그 문장들이 사는 곳으로 간다 — 답이 온 문장이 하나면 그 문장 화면,
 * 여럿이면 그 책의 '담은 표현', 답을 못 받았으면 기다리는 문장, 그냥 담았으면 그
 * 책의 '마음에 들었던 문장'.
 *
 * 글자를 읽는 일은 기기가 하고(Apple Vision), 문장 경계는 `shared/ocr/selection`이
 * 마침표로 찾는다. 틀리면 시트에서 독자가 문장을 고친다.
 *
 * 사진은 기기 밖으로 나가지 않는다. 서버로 가는 것은 읽어낸 글자뿐이다.
 */
export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();

  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [shot, setShot] = useState<Shot | null>(null);
  const [words, setWords] = useState<OcrWord[]>([]);
  const [reading, setReading] = useState(false);

  const picks = usePicks(words);
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * 시트에서 고친 문장 — 문장의 단어 범위(`from-to`)로 붙든다. 고르기가 바뀌어 그
   * 범위가 사라지면 고친 글도 함께 버려진다(아래 `sheet`가 범위로만 찾는다).
   */
  const [edits, setEdits] = useState<Record<string, string>>({});
  /**
   * 시트에서 글의 단어를 눌러 고른 표현 — 문장 하나가 이 목록을 갖게 되면 그 문장의 표현은
   * 사진 위 고르기에서 떨어져 나와 **글자로** 붙든다(고친 글에서 새 단어를 고를 수 있어야 해서).
   * `edits`처럼 문장의 범위로 붙들고, 범위가 사라지면 함께 버려진다.
   */
  const [custom, setCustom] = useState<Record<string, string[]>>({});
  /** 미리 채우지 않는다 — 독자가 직접 적는다 */
  const [pageEdit, setPageEdit] = useState<string>();

  const createAsk = usePostAsk();
  const keepSentence = usePostSentence();
  const { data: quota } = useGetAskQuota();
  const { data: current } = useCurrentBook();
  const { data: chosen } = useGetBook(params.bookId);
  const book = chosen ?? current?.book;
  const left = quota?.remaining ?? 0;
  const moveProgress = usePatchProgress(book?.id ?? '');

  const lastPage =
    (current?.book.id === book?.id
      ? current?.progress.currentPage
      : undefined) ??
    book?.currentPage ??
    0;
  const pageText = pageEdit ?? '';
  /** 책에 없는 쪽은 쪽이 아니다 — 시트가 이유를 말하고, 서버도 한 번 더 막는다 */
  const typedPage = Number(pageText);
  const page =
    typedPage > 0 && (!book?.pages || typedPage <= book.pages)
      ? typedPage
      : undefined;

  /** 문장이 있는 쪽까지는 읽은 것이다 — 진도를 앞으로만 옮긴다 */
  const recordPage = () => {
    if (!book || !page || page <= lastPage) return;
    moveProgress.mutate(page);
  };

  const busy = createAsk.isPending || keepSentence.isPending;

  /** 시트에 세울 문장들 — 고친 글이 있으면 그것, 표현이 아직 그 글에 있는지까지 */
  const sheet: SheetSentence[] = useMemo(
    () =>
      picks.groups.map((group) => {
        const key = `${group.from}-${group.to}`;
        const text = edits[key] ?? group.text;
        const typed = custom[key];
        return {
          key,
          text,
          picks: typed
            ? typed.map((surface) => ({
                surface,
                from: -1,
                to: -1,
                missing: !pickStillIn(text, surface),
              }))
            : group.picks.map((pick) => ({
                surface: pick.surface,
                from: pick.from,
                to: pick.to,
                missing: !pickStillIn(text, pick.surface),
              })),
        };
      }),
    [picks.groups, edits, custom],
  );
  const pickCount = sheet.reduce((sum, s) => sum + s.picks.length, 0);

  const shoot = async () => {
    if (!camera.current || reading) return;
    setReading(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error('사진을 찍지 못했어요.');

      const read = await readLines(photo.uri, languagesFor(book));
      if (!read.lines.length)
        throw new Error('글자를 읽지 못했어요. 더 가까이서 찍어보세요.');

      /**
       * 단어 좌표가 없으면 사진 위에서 짚을 수 없다 — 줄을 문장으로 이어 주던 서버
       * 호출은 걷어냈다. 좌표를 주는 곳은 iOS(Apple Vision)뿐이다.
       */
      if (!read.words.length)
        throw new Error(
          '이 기기에서는 사진 위에서 문장을 고를 수 없어요. 직접 적어서 물어봐 주세요.',
        );

      /** 좌표를 준 인식기가 잰 크기가 우선이다 — 좌표가 그 크기에 기대고 있다 */
      setShot({
        uri: photo.uri,
        width: read.width ?? photo.width,
        height: read.height ?? photo.height,
      });
      setWords(read.words);
    } catch (error) {
      Alert.alert(
        '다시 찍어볼까요',
        error instanceof Error ? error.message : '',
      );
    } finally {
      setReading(false);
    }
  };

  const retake = () => {
    setShot(null);
    setWords([]);
    picks.clear();
    setEdits({});
    setCustom({});
    setSheetOpen(false);
  };

  /**
   * 칩에서 표현을 빼면 사진 위의 고르기도 풀린다. 한 문장의 표현이 다 빠지면 그 문장은 알아서
   * 빠지고, 문장이 다 빠지면 시트도 닫힌다.
   */
  const removePick = (key: string, pick: SheetSentence['picks'][number]) => {
    if (pick.from < 0) {
      const rest = (custom[key] ?? []).filter((s) => s !== pick.surface);
      if (rest.length) {
        setCustom((prev) => ({ ...prev, [key]: rest }));
        return;
      }
      /** 모르는 단어가 하나도 없는 문장은 물을 까닭이 없다 — 알아서 뺀다 */
      const group = picks.groups.find((g) => `${g.from}-${g.to}` === key);
      if (group) picks.unpick(group.from, group.to);
      setCustom(({ [key]: _gone, ...left }) => left);
      setEdits(({ [key]: _gone, ...left }) => left);
      if (sheet.length <= 1) setSheetOpen(false);
      return;
    }
    picks.unpick(pick.from, pick.to);
    if (pickCount <= 1) setSheetOpen(false);
  };

  /**
   * 글을 고친다. 고르던 글자가 고친 글의 더 큰 단어 안에 들어갔으면(`pa` → `patronizing`)
   * 그 표현이 단어를 따라간다 — 이때부터는 사진에 매이지 않고 글자로 붙든다.
   */
  const changeText = (key: string, next: string) => {
    const now = sheet.find((s) => s.key === key);
    setEdits((prev) => ({ ...prev, [key]: next }));
    if (!now) return;
    const surfaces = now.picks.map((pick) => pick.surface);
    const followed = followEdit(now.text, next, surfaces);
    if (followed.some((surface, i) => surface !== surfaces[i]))
      setCustom((prev) => ({ ...prev, [key]: followed }));
  };

  /** 글의 단어를 눌렀다 — 새 표현으로 더하고, 이미 고른 단어면 그 표현을 뺀다 */
  const togglePick = (key: string, surface: string) => {
    const now = sheet.find((s) => s.key === key);
    if (!now) return;
    const surfaces = now.picks.map((pick) => pick.surface);
    /**
     * 이 문장에서 이미 고른 글자를 또 누르면 막는다 — 같은 단어가 문장에 두 번 나오는 경우다.
     * (이미 고른 쪽의 글자를 누르면 그 표현을 푸는 것이라 여기까지 오지 않는다.)
     */
    if (
      surfaces.some((picked) => picked.toLowerCase() === surface.toLowerCase())
    ) {
      showToast(limitMessage('duplicate'));
      return;
    }
    if (surfaces.length >= MAX_PICKS) {
      showToast(limitMessage('picks'));
      return;
    }
    if (surface.length > MAX_PICK_CHARS) {
      showToast(limitMessage('long'));
      return;
    }
    setCustom((prev) => ({ ...prev, [key]: [...surfaces, surface] }));
  };

  const ask = async () => {
    if (!book || !sheet.length || !page || busy) return;
    try {
      const views = await createAsk.mutateAsync({
        bookId: book.id,
        page,
        sentences: sheet.map((sentence) => ({
          text: sentence.text.trim(),
          picks: sentence.picks.map((pick) => pick.surface),
        })),
      });
      recordPage();
      /**
       * 답이 하나 왔으면 그 문장 화면에서 뜻을 편 채로, 여럿이면 그 책의 '담은
       * 표현'으로 — 방금 담긴 것들이 거기 모여 있다. 하나도 못 받았으면(질문 소진·
       * 연결 실패) 문장은 담겼고 답을 기다리는 줄에 선다 — 그 목록으로 간다.
       */
      const answered = views.filter(
        (view) => view.ask.status === 'answered' && view.sentence,
      );
      if (answered.length === 1 && views.length === 1) {
        router.replace({
          pathname: '/sentence/[id]',
          params: { id: answered[0].sentence!._id, reveal: '1' },
        });
      } else if (answered.length) {
        router.replace({
          pathname: '/book/[id]',
          params: { id: book.id, tab: 'items' },
        });
      } else {
        router.replace('/pending');
      }
    } catch (error) {
      const failure = explainAskError(error);
      Alert.alert(failure.title, failure.message);
      /** 늦은 것일 뿐 문장은 담겨 있다 — 막다른 길로 두지 않고 기다리는 문장으로 보낸다 */
      if (failure.saved) router.replace('/pending');
    }
  };

  /** 뜻은 몰라도 되고 그냥 좋았던 문장들 — 질문 횟수를 쓰지 않는다 */
  const keepOnly = async () => {
    if (!book || !sheet.length || !page || busy) return;
    try {
      for (const sentence of sheet) {
        await keepSentence.mutateAsync({
          bookId: book.id,
          text: sentence.text.trim(),
          page,
        });
      }
      recordPage();
      router.replace({
        pathname: '/book/[id]',
        params: { id: book.id, tab: 'liked' },
      });
    } catch (error) {
      if (isAnonymousLimit(error)) {
        offerSignIn(() => router.push('/sign-in'));
        return;
      }
      Alert.alert('담지 못했어요', error instanceof Error ? error.message : '');
    }
  };

  if (!available) {
    return (
      <Notice
        title="이 빌드에서는 글자를 읽지 못해요"
        body="글자 인식기는 개발 빌드에서만 돌아요 — Expo Go에서는 안 돼요. 지금은 문장을 직접 적어서 물어볼 수 있어요."
        action="문장 적어서 묻기"
        onPress={() => router.replace('/ask')}
        onBack={() => router.back()}
      />
    );
  }

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    if (permission.canAskAgain) {
      requestPermission();
      return <View style={styles.screen} />;
    }
    return (
      <Notice
        title="카메라 접근이 막혀 있어요"
        body="설정에서 카메라 접근을 변경할 수 있어요."
        action="설정 열기"
        onPress={() => Linking.openSettings()}
        onBack={() => router.back()}
      />
    );
  }

  /* ── 찍기 전 ─────────────────────────────────────────────── */
  if (!shot) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          leading="close"
          onLeadingPress={() => router.back()}
          title="페이지 촬영"
        />

        <View style={styles.viewfinder}>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
          />
          {reading ? (
            <View style={styles.reading}>
              <ActivityIndicator color={color.text.onInk} />
              <AppText style={styles.readingLabel}>
                글자를 읽는 중이에요…
              </AppText>
            </View>
          ) : null}
        </View>

        <View
          style={[styles.shutterRow, { paddingBottom: insets.bottom + 16 }]}
        >
          <Tap
            style={styles.shutter}
            onPress={shoot}
            disabled={reading}
            accessibilityRole="button"
            accessibilityLabel="찍기"
          >
            <View style={styles.shutterCore} />
          </Tap>
        </View>
      </View>
    );
  }

  /* ── 찍은 뒤: 쪽 위에서 모르는 단어 고르기 ─────────────────── */
  return (
    /* 자판이 올라오면 시트가 스스로 화면 위까지 자란다(`AskSheet`) */
    <View style={styles.screen}>
      <ScreenHeader
        leading="back"
        onLeadingPress={retake}
        trailing={
          <HeaderAction
            label="다시 찍기"
            tone={color.text.meta}
            onPress={retake}
          />
        }
      />

      <View style={styles.stage}>
        <PhotoPicker
          shot={shot}
          words={words}
          ranges={picks.ranges}
          selected={picks.selected}
          groups={picks.groups}
          onChange={picks.change}
          onToggle={picks.toggle}
        />
      </View>

      {/* 고른 것이 생기면 배지가 뜨고, 고르기 전에는 무엇을 하는 화면인지 한 줄이 말한다 */}
      <View style={styles.below}>
        {!picks.groups.length ? (
          <AppText style={styles.guide}>
            모르는 단어를 누르세요 · 끌면 여러 단어를 한 번에
          </AppText>
        ) : null}
        {picks.groups.length && !sheetOpen ? (
          <PickBadge
            picks={pickCount}
            sentences={picks.groups.length}
            limit={picks.limit}
            onPress={() => setSheetOpen(true)}
          />
        ) : null}
      </View>

      {sheetOpen && sheet.length ? (
        <AskSheet
          sentences={sheet}
          onChangeText={changeText}
          onTogglePick={togglePick}
          onRemovePick={removePick}
          page={pageText}
          onChangePage={setPageEdit}
          maxPage={book?.pages || undefined}
          quotaLeft={left}
          asking={createAsk.isPending}
          keeping={keepSentence.isPending}
          onAsk={ask}
          onKeepOnly={keepOnly}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}

      <AskingOverlay visible={createAsk.isPending} sentences={sheet.length} />
    </View>
  );
}

/** 찍을 수 없는 자리들 — 막다른 길로 두지 않고 손으로 적는 길을 함께 준다 */
function Notice({
  title,
  body,
  action,
  onPress,
  onBack,
}: {
  title: string;
  body: string;
  action: string;
  onPress: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScreenHeader
        leading="close"
        onLeadingPress={onBack}
        title="페이지 촬영"
      />
      <View style={styles.notice}>
        <AppText style={styles.noticeTitle}>{title}</AppText>
        <AppText style={styles.noticeBody}>{body}</AppText>
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <ActionButton label={action} onPress={onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  /** 찍은 쪽이 화면을 채운다. 시트는 이 위로 올라온다. */
  stage: {
    flex: 1,
    marginHorizontal: gutter,
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  /**
   * 사진 아래 빈 자리 — 안내 글이나 배지가 **가운데**에 선다. 바닥(홈 인디케이터)에
   * 붙이면 엄지가 닿기 전에 눈이 먼저 사진 쪽으로 가 버린다. 배지가 드나들어도 사진이
   * 흔들리지 않게 높이를 고정한다.
   */
  below: {
    height: 92,
    paddingHorizontal: gutter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: { ...type.label2, color: color.text.meta, textAlign: 'center' },

  /** 뷰파인더는 잉크 위에 둔다 — 종이를 비추는 동안은 화면이 물러나야 한다 */
  viewfinder: {
    flex: 1,
    margin: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: color.surface.ink,
  },
  reading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: ink(0.55),
  },
  readingLabel: { ...type.label2, color: color.text.onInk },

  shutterRow: { alignItems: 'center', gap: 14, paddingTop: 4 },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: color.text.primary,
  },
  shutterCore: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.text.primary,
  },

  notice: { flex: 1, paddingHorizontal: gutter, paddingTop: 40, gap: 10 },
  noticeTitle: { ...type.heading2, color: color.text.primary, lineHeight: 30 },
  noticeBody: { ...type.label1, color: color.text.secondary, lineHeight: 23 },

  footer: { paddingHorizontal: gutter, paddingTop: 12 },
});
