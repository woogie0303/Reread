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
  useGetItem,
  useGetItems,
  usePostRemoveEncounters,
} from '@/entities/lexical-item/api/item.api';
import { color, gutter, type } from '@/shared/config';
import {
  ActionButton,
  AppText,
  DisclosureRow,
  MoreIcon,
  OptionSheet,
  ScreenHeader,
  Tap,
  TrashIcon,
  showToast,
} from '@/shared/ui';
import { ItemDetail } from '@/widgets/item-detail/ui/item-detail';

/**
 * 담은 표현 하나 — 문장 화면이나 서랍에서 표현을 누르면 온다. 뜻과, 이 표현을 만난
 * 문장들이 서랍(문장의 목록)과 따로 선다.
 *
 * **지우는 일은 여기서만 한다.** 헤더 오른쪽 ⋮ → '삭제하기'를 고르면 만난 문장 옆에 체크
 * 칸이 서고, 고른 문장에서 이 표현을 뺀다. 전부 고르면 표현이 서랍에서 사라진다. 문장
 * 화면에는 지우는 자리를 두지 않는다 — 거기서는 문장을 읽는 일에 집중한다.
 */
export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: detail, isPending, error } = useGetItem(id);
  /** 헷갈리는 짝은 표제형 하나만 있으면 되므로 따로 한 번 더 물어본다 */
  const { data: twin } = useGetItem(detail?.item.confusedWith?.itemId);
  const { data: items = [] } = useGetItems();
  const remove = usePostRemoveEncounters();

  const [menuOpen, setMenuOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  /** 문장을 못 찾은 만남은 그릴 것도 고를 것도 없다 — `ItemDetail`과 같은 거름 */
  const encounters = (detail?.encounters ?? []).filter(
    (met) => met.sentence && met.book,
  );

  const toggle = (sentenceId: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(sentenceId)) next.delete(sentenceId);
      else next.add(sentenceId);
      return next;
    });

  const toggleAll = () =>
    setPicked((prev) =>
      prev.size === encounters.length
        ? new Set()
        : new Set(encounters.map((met) => met.sentenceId)),
    );

  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  /**
   * 이 표현을 빼면 담은 표현이 하나도 안 남는 문장 — 서버가 함께 정리한다. 하트를 켠
   * 문장과 내 생각을 단 문장은 남는다(서버 `forgetOrphans`와 같은 규칙).
   */
  const vanishing = (sentenceIds: string[]) =>
    sentenceIds.filter((sentenceId) => {
      const elsewhere = items.some(
        (other) =>
          other.id !== id &&
          other.encounters.some((met) => met.sentenceId === sentenceId),
      );
      if (elsewhere) return false;
      const sentence = encounters.find(
        (met) => met.sentenceId === sentenceId,
      )?.sentence;
      return !sentence?.favorite && !sentence?.thoughts?.length;
    }).length;

  /** 표현 이름 뒤에는 조사를 붙이지 않는다 — 영어 뒤의 은/는·이/가는 발음으로 갈려서(`delete-impact`) */
  const confirmDelete = () => {
    if (!detail || !picked.size || remove.isPending) return;
    const sentenceIds = [...picked];
    const all = sentenceIds.length === encounters.length;
    const term = detail.item.term;
    const gone = vanishing(sentenceIds);

    const lines = [
      all
        ? `‘${term}’ — 만난 문장 모두에서 빠지고 서랍에서 사라져요.`
        : `‘${term}’ — 고른 문장 ${sentenceIds.length}개에서 빠져요. 나머지 문장의 기록은 그대로 남아요.`,
      gone
        ? `담은 표현이 하나도 안 남는 문장 ${gone}개는 서랍에서 함께 사라져요.`
        : '',
    ].filter(Boolean);

    Alert.alert(
      all ? '이 표현을 지울까요?' : '고른 문장에서 뺄까요?',
      lines.join('\n'),
      [
        { text: '그대로 둘게요', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: () =>
            remove.mutate(
              { itemId: detail.item._id, sentenceIds },
              {
                onSuccess: (result) => {
                  /** 표현이 통째로 사라졌으면 이 화면이 보여줄 것이 없다 */
                  if (result.removed === 'item') {
                    showToast('표현을 삭제했어요');
                    router.back();
                  } else {
                    showToast('고른 문장에서 표현을 뺐어요');
                    stopSelecting();
                  }
                },
                onError: (failure) =>
                  Alert.alert(
                    '지우지 못했어요',
                    failure instanceof Error ? failure.message : '',
                  ),
              },
            ),
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        leading="back"
        onLeadingPress={() => router.back()}
        title="담은 표현"
        trailing={
          !detail ? undefined : selecting ? (
            <Tap
              hitSlop={10}
              onPress={stopSelecting}
              accessibilityRole="button"
            >
              <AppText style={styles.cancel}>취소</AppText>
            </Tap>
          ) : (
            <Tap
              hitSlop={10}
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="이 표현 더 보기"
            >
              <MoreIcon size={22} color={color.text.primary} />
            </Tap>
          )
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
        ) : detail ? (
          <ItemDetail
            detail={detail}
            twinTerm={twin?.item.term}
            onOpenItem={(next) =>
              router.push({ pathname: '/item/[id]', params: { id: next } })
            }
            onOpenSentence={(sentenceId) =>
              router.push({
                pathname: '/sentence/[id]',
                params: { id: sentenceId },
              })
            }
            selection={
              selecting
                ? { selected: picked, onToggle: toggle, onToggleAll: toggleAll }
                : undefined
            }
          />
        ) : (
          <AppText style={styles.missing}>
            {error?.message ?? '담아둔 표현을 찾지 못했어요.'}
          </AppText>
        )}
      </ScrollView>

      {selecting ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <ActionButton
            label={
              picked.size
                ? `${picked.size}개 문장에서 삭제하기`
                : '지울 문장을 골라주세요'
            }
            variant="ink"
            disabled={!picked.size}
            loading={remove.isPending}
            onPress={confirmDelete}
          />
        </View>
      ) : null}

      <OptionSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <DisclosureRow
          icon={<TrashIcon size={19} color={color.text.primary} />}
          title="삭제하기"
          body="만난 문장을 골라서 이 표현을 빼요."
          onPress={() => {
            setMenuOpen(false);
            setSelecting(true);
          }}
        />
      </OptionSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: 32 },
  spinner: { paddingTop: 40 },
  cancel: { ...type.label1, color: color.text.secondary },
  footer: { paddingHorizontal: gutter, paddingTop: 12 },
  missing: {
    ...type.label1,
    color: color.text.secondary,
    paddingTop: 40,
    textAlign: 'center',
  },
});
