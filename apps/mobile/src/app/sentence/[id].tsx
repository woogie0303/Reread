import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGetBooks } from '@/entities/book/api/book.api';
import { useGetItems } from '@/entities/lexical-item/api/item.api';
import { useGetReader } from '@/entities/reader/api/reader.api';
import {
  usePostThought,
  useDeleteExpressions,
  useDeleteSentence,
  usePatchSentenceFavorite,
  useDeleteThought,
  useGetSentence,
  useGetSentenceAsk,
} from '@/entities/sentence/api/sentence.api';
import {
  clearMessage,
  deleteImpact,
  deleteMessage,
} from '@/entities/sentence/lib/delete-impact';
import { buildFeed } from '@/entities/sentence/lib/feed';
import { color, gutter, type } from '@/shared/config';
import {
  AppText,
  AskIcon,
  DisclosureRow,
  HeartIcon,
  MoreIcon,
  OptionSheet,
  ScreenHeader,
  Tap,
  TrashIcon,
  showToast,
} from '@/shared/ui';
import { SentenceDetail } from '@/widgets/sentence-detail/ui/sentence-detail';
import {
  ThoughtInput,
  ThoughtThread,
} from '@/widgets/sentence-thoughts/ui/thought-thread';

/**
 * 문장 하나 — 서랍에서 줄을 누르면 온다.
 *
 * 서랍 목록의 캐시에 기대지 않고 문장 id 하나로 스스로 불러온다. 목록에서 "더 보기"로
 * 받은 줄이나, 나중에 다른 화면에서 들어와도 같은 모양으로 서야 한다.
 *
 * 한 줄로 합치는 규칙(밑줄·번역·책)은 서랍과 같은 `buildFeed`를 쓴다 — 목록과
 * 상세가 같은 문장을 다르게 그리면 어느 쪽이 맞는지 알 수 없어진다.
 *
 * **어디서 왔는지에 따라 모양이 둘이다.** 한 문장이 '마음에 들었던 문장'이면서
 * '담은 표현'일 수 있어서, 문장이 아니라 들어온 길이 정한다.
 * - '마음에 들었던 문장'에서(`from=liked`) — 문장과, 거기 단 **내 생각**의 스레드.
 *   쓰는 칸이 화면 바닥에 붙는다(스레드의 답글 칸처럼). 표현 목록은 없다.
 * - 그 밖(담은 표현·표현 화면·막 물어본 길) — 뜻과 담은 표현·다른 표현. 스레드는 없다.
 *
 * 생각을 쓰려고 자판을 올리면 늘 맨 아래(가장 최근 생각과 쓰는 칸)가 보이게
 * 끝으로 내린다 — 자판이 화면 절반을 덮으면 방금 쓰던 자리가 가려진다.
 */
export default function SentenceScreen() {
  /**
   * reveal — 방금 물어서 온 길이면 뜻을 편 채로 연다. 그걸 보러 온 것이니까. 값이
   * 있기만 하면 펴고, 값 자체는 다시 물을 때마다 바뀐다(질문 모달이 돌아올 때).
   */
  const { id, reveal, from } = useLocalSearchParams<{
    id: string;
    reveal?: string;
    from?: 'liked';
  }>();
  const threadMode = from === 'liked';
  const scroll = useRef<ScrollView>(null);
  /** 생각을 보낸 뒤 새 줄이 그려지면 그때 끝으로 내린다 — 그리기 전에 내리면 한 줄 모자란다 */
  const stickToEnd = useRef(false);

  useEffect(() => {
    if (!threadMode) return;
    const sub = Keyboard.addListener('keyboardDidShow', () =>
      scroll.current?.scrollToEnd({ animated: true }),
    );
    return () => sub.remove();
  }, [threadMode]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const sentence = useGetSentence(id);
  const asked = useGetSentenceAsk(id);
  const { data: books = [] } = useGetBooks();
  const { data: items = [] } = useGetItems();

  const remove = useDeleteSentence();
  const clear = useDeleteExpressions();
  const favorite = usePatchSentenceFavorite();
  const addThought = usePostThought(id);
  const removeThought = useDeleteThought(id);
  const { data: reader } = useGetReader();
  const nickname = reader?.nickname ?? '나';

  const sendThought = async (text: string) => {
    try {
      stickToEnd.current = true;
      await addThought.mutateAsync(text);
    } catch (error) {
      stickToEnd.current = false;
      Alert.alert(
        '남기지 못했어요',
        error instanceof Error ? error.message : '',
      );
      throw error;
    }
  };

  const confirmRemoveThought = (thoughtId: string) =>
    Alert.alert('이 생각을 지울까요?', undefined, [
      { text: '그대로 둘게요', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () =>
          removeThought.mutate(thoughtId, {
            onError: (error) =>
              Alert.alert(
                '지우지 못했어요',
                error instanceof Error ? error.message : '',
              ),
          }),
      },
    ]);

  const view = asked.data ?? null;
  const row = sentence.data
    ? buildFeed({
        asks: view ? [view] : [],
        liked: view ? [] : [sentence.data],
        books,
        items,
      })[0]
    : undefined;

  /**
   * 담은 표현이 없는 문장은 서랍에 사는 자리가 '마음에 들었던 문장'뿐이다 — 하트가 처음부터
   * 차 있고, 끌 수 없다. 끌 수 있게 두면 꺼도 그 갈래에 그대로 남아서(또는 어느 갈래에도
   * 안 서서) 누른 것이 아무 일도 안 한 것처럼 보이거나 문장이 보이지 않게 된다. 그래서
   * 이런 문장에서 '빼기'는 곧 지우기다. 답을 기다리는 문장은 아직 표현이 없을 뿐이라 뺀다.
   */
  const always = Boolean(row && !row.pending && !row.claimed);
  /** 누르는 즉시 바뀐 것처럼 보인다 — 서버가 돌아올 때까지 기다리면 두 번 누르게 된다 */
  const hearted =
    always ||
    (favorite.isPending
      ? favorite.variables.favorite
      : Boolean(sentence.data?.favorite));

  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * ⋮에서 고른 일은 시트가 내려간 뒤에 한다. 시트가 내려가는 중에 확인 창을
   * 띄우면 iOS가 겹친 창을 받아주지 않아 그냥 사라진다(책 화면과 같다).
   */
  const afterSheet = (run: () => void) => {
    setMenuOpen(false);
    setTimeout(run, 280);
  };

  /** 이 문장에 단 내 생각 — '마음에 들었던 문장'에서 열었을 때만 보인다 */
  const thoughtCount = sentence.data?.thoughts?.length ?? 0;

  const setHeart = (next: boolean) => {
    if (!id) return;
    favorite.mutate(
      { id, favorite: next },
      {
        onSuccess: () => {
          showToast(
            next ? '마음에 든 문장에 추가했어요' : '마음에 든 문장에서 뺐어요',
          );
          /** '마음에 들었던 문장'에서 열었는데 뺐으면 이 문장은 이제 그 목록에 없다 */
          if (!next && threadMode) router.back();
        },
        onError: (error) =>
          Alert.alert(
            '바꾸지 못했어요',
            error instanceof Error ? error.message : '',
          ),
      },
    );
  };

  /**
   * 하트를 끄면 이 문장은 '마음에 들었던 문장'을 떠나고, 거기서만 보이던 내 생각도
   * 함께 안 보이게 된다. 생각이 달려 있으면 한 번 더 묻는다. 지우지는 않는다 —
   * 다시 넣으면 그대로 돌아온다(그래서 확인 창도 '사라져요'가 아니라 '안 보여요'다).
   */
  const toggleHeart = () => {
    if (!id || always || favorite.isPending) return;
    if (!hearted || !thoughtCount) {
      setHeart(!hearted);
      return;
    }
    Alert.alert(
      '마음에 든 문장에서 뺄까요?',
      `이 문장에 남긴 생각 ${thoughtCount}개는 '마음에 들었던 문장'에서만 보여요. 빼면 더 이상 안 보이고, 다시 넣으면 돌아와요.`,
      [
        { text: '그대로 둘게요', style: 'cancel' },
        { text: '빼기', style: 'destructive', onPress: () => setHeart(false) },
      ],
    );
  };

  /** 이 문장을 만난 항목 — 밑줄(surface)이 없어도 담은 것이면 다 */
  const saved = items.filter((item) =>
    item.encounters.some((met) => met.sentenceId === id),
  );

  /** 담아둔 문장을 묻는다 — 모르는 단어를 고르는 질문 화면에서, 이 문장 그대로 */
  const askNow = () => {
    if (!id) return;
    router.push({ pathname: '/ask', params: { sentenceId: id } });
  };

  /**
   * 지우기는 문장만 지우지 않는다 — 그 문장이 마지막 만남이던 표현은 서랍에서
   * 함께 사라진다. 묻기 전에 무엇이 사라지는지 세어서 이름까지 말한다.
   */
  const deleteNow = async () => {
    if (!id) return;
    try {
      await remove.mutateAsync(id);
      showToast('문장을 삭제했어요');
      router.back();
    } catch (error) {
      Alert.alert(
        '지우지 못했어요',
        error instanceof Error ? error.message : '',
      );
    }
  };

  /**
   * 하트를 켠 문장을 '담은 표현' 쪽에서 지울 때는 문장을 남기고 표현만 지운다 — 같은
   * 문장이 '마음에 들었던 문장'에도 서 있어서, 둘 다 지우면 거기서 지운 적 없는 것까지
   * 사라진다.
   */
  const clearNow = async () => {
    if (!id) return;
    try {
      await clear.mutateAsync(id);
      showToast('담은 표현을 지웠어요');
      router.back();
    } catch (error) {
      Alert.alert(
        '지우지 못했어요',
        error instanceof Error ? error.message : '',
      );
    }
  };

  const confirmClear = () => {
    if (!id || clear.isPending) return;
    Alert.alert(
      '담은 표현을 지울까요?',
      clearMessage(deleteImpact(id, items)),
      [
        { text: '그대로 둘게요', style: 'cancel' },
        { text: '지우기', style: 'destructive', onPress: clearNow },
      ],
    );
  };

  const confirmDelete = () => {
    if (!id || remove.isPending) return;
    Alert.alert('이 문장을 지울까요?', deleteMessage(deleteImpact(id, items)), [
      { text: '그대로 둘게요', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: deleteNow },
    ]);
  };

  /**
   * 표현 없는 문장을 '마음에 든 문장'에서 뺀다 — 그 문장이 서랍에 사는 자리는
   * 여기뿐이라, 빼면 갈 곳이 없어 지워진다. 그래서 따로 '삭제' 줄을 두지 않고
   * 이 한 줄이 그 일을 하되, 지워진다는 것을 확인 창에서 먼저 말한다.
   */
  const confirmUnlikeAndDelete = () => {
    if (!id || remove.isPending) return;
    Alert.alert(
      '마음에 든 문장에서 뺄까요?',
      thoughtCount
        ? `표현을 담지 않은 문장이라, 빼면 서랍에서 사라지고 지워져요. 남긴 생각 ${thoughtCount}개도 함께 지워져요.`
        : '표현을 담지 않은 문장이라, 빼면 서랍에서 사라지고 지워져요.',
      [
        { text: '그대로 둘게요', style: 'cancel' },
        { text: '빼고 지우기', style: 'destructive', onPress: deleteNow },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/*
        문장 전체에 대한 일(묻기·마음에 든 문장·지우기)은 ⋮ 하나로 접는다 — 책 화면과
        같은 시트다. 한동안 아이콘 셋이 머리에 나란히 섰는데, 문장보다 아이콘이 먼저
        눈에 들어왔고 책 화면과 모양이 달랐다.
      */}
      <ScreenHeader
        leading="back"
        onLeadingPress={() => router.back()}
        title="서랍"
        trailing={
          !sentence.data ? undefined : (
            <Tap
              hitSlop={10}
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="이 문장 더 보기"
            >
              <MoreIcon size={22} color={color.text.primary} />
            </Tap>
          )
        }
      />
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => {
          if (!stickToEnd.current) return;
          stickToEnd.current = false;
          scroll.current?.scrollToEnd({ animated: true });
        }}
        style={styles.scroll}
      >
        {sentence.isPending ? (
          <ActivityIndicator
            style={styles.spinner}
            color={color.text.assistive}
          />
        ) : row ? (
          <SentenceDetail
            /**
             * 다시 물으면 질문 모달이 이 화면으로 돌아오며 reveal에 새 값을 준다. 펼침은
             * 처음 그릴 때만 정해지므로, 값이 바뀌면 새로 그려서 뜻을 다시 편다.
             */
            key={reveal ?? 'closed'}
            row={row}
            initialReveal={Boolean(reveal)}
            saved={saved}
            onOpenItem={(itemId) =>
              router.push({ pathname: '/item/[id]', params: { id: itemId } })
            }
            expressions={!threadMode}
          />
        ) : (
          <AppText style={styles.missing}>
            {sentence.error?.message ?? '담아둔 문장을 찾지 못했어요.'}
          </AppText>
        )}

        {threadMode && sentence.data?.thoughts?.length ? (
          <View style={styles.thoughts}>
            <ThoughtThread
              thoughts={sentence.data.thoughts}
              nickname={nickname}
              avatar={reader?.profileImage}
              onRemove={confirmRemoveThought}
            />
          </View>
        ) : null}
      </ScrollView>

      {threadMode && sentence.data ? (
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <ThoughtInput
            onSend={sendThought}
            sending={addThought.isPending}
            nickname={nickname}
            avatar={reader?.profileImage}
          />
        </View>
      ) : null}

      <OptionSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        {/*
          물어본 문장도 다시 물을 수 있다 — 처음에 못 고른 단어가 있을 수 있어서. 물어본 적
          없는 문장은 '물어보기', 물어본 문장은 '다시 골라서 물어보기'. 같은 질문 화면이
          열리고, 이 문장 그대로라 글은 고칠 수 없다.
        */}
        {row ? (
          <DisclosureRow
            icon={<AskIcon size={19} color={color.text.primary} />}
            title={row.asked ? '다시 골라서 물어보기' : '이 문장 물어보기'}
            body={
              row.asked
                ? '못 고른 단어를 더 골라서 물어요. 질문을 한 번 써요.'
                : '모르는 단어를 고르면 이 문장에서의 뜻을 알려줘요.'
            }
            onPress={() => afterSheet(askNow)}
          />
        ) : null}
        {/*
          빼기와 지우기가 같은 일이 되는 경우를 하나로 합친다.
          - 표현 없는 문장: 서랍에 사는 자리가 '마음에 들었던 문장'뿐이라 빼면 갈
            곳이 없다 → '빼기' 한 줄만 두고, 누르면 지워진다고 확인한다.
          - 표현 있는 문장: 빼도 담은 표현에 남는다 → 넣기/빼기와 삭제가 따로 선다.
        */}
        {always ? (
          <DisclosureRow
            icon={<HeartIcon size={19} filled color={color.primary} />}
            title="마음에 든 문장에서 빼기"
            body="담은 표현이 없는 문장이라, 빼면 지워져요."
            onPress={() => afterSheet(confirmUnlikeAndDelete)}
          />
        ) : (
          <>
            <DisclosureRow
              icon={
                <HeartIcon
                  size={19}
                  filled={hearted}
                  color={hearted ? color.primary : color.text.primary}
                />
              }
              title={
                hearted ? '마음에 든 문장에서 빼기' : '마음에 든 문장에 넣기'
              }
              body={
                hearted
                  ? '담은 표현에는 그대로 남아요.'
                  : "표현을 담은 문장도 '마음에 들었던 문장'에 함께 모여요."
              }
              onPress={() => afterSheet(toggleHeart)}
            />
            {/*
              '마음에 들었던 문장'에서 열었으면 지우는 일은 거기서 빼는 것으로 끝이다 — 담은
              표현까지 지우지 않는다. 그 밖에서 열었으면(담은 표현 쪽): 하트를 켠 문장은
              표현만 지우고 문장을 남기고, 아니면 문장째 지운다.
            */}
            {threadMode ? null : hearted ? (
              <DisclosureRow
                icon={<TrashIcon size={19} color={color.text.primary} />}
                title="담은 표현에서 지우기"
                body="마음에 든 문장에는 그대로 남아요."
                onPress={() => afterSheet(confirmClear)}
              />
            ) : (
              <DisclosureRow
                icon={<TrashIcon size={19} color={color.text.primary} />}
                title="문장 삭제하기"
                body="이 문장에서만 만난 표현도 함께 지워져요."
                onPress={() => afterSheet(confirmDelete)}
              />
            )}
          </>
        )}
      </OptionSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: 24 },
  /** 문장 화면의 마지막 구획 — 위의 '이 문장 지우기' 대신 스레드가 끝을 맺는다 */
  thoughts: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border.subtle,
  },
  inputBar: {
    paddingHorizontal: gutter,
    paddingTop: 8,
    backgroundColor: color.surface.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border.subtle,
  },
  spinner: { paddingTop: 40 },
  missing: {
    ...type.label1,
    color: color.text.secondary,
    paddingTop: 40,
    textAlign: 'center',
  },
});
