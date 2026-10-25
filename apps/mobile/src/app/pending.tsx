import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useGetPendingAsks,
  useGetAskQuota,
  usePostAdBonus,
  usePostResolveAsk,
} from '@/entities/ask/api/ask.api';
import { explainAskError } from '@/entities/ask/lib/explain-error';
import { toBook } from '@/entities/book/api/book.api';
import { useDeleteSentence } from '@/entities/sentence/api/sentence.api';
import { showRewarded } from '@/shared/ads/ads';
import { color, gutter } from '@/shared/config';
import { savedLabel } from '@/shared/lib/date';
import { useSession } from '@/shared/session/session';
import { AskingOverlay, NoticePanel, ScreenHeader } from '@/shared/ui';
import { PendingList } from '@/widgets/pending-asks/ui/pending-list';

/**
 * 답을 기다리는 문장들.
 *
 * 여기가 이 앱의 유일한 권유 자리다 — 광고도 결제도 읽는 중에 끼어들지 않고,
 * 이미 멈춰 선 이 화면에서만 말을 건다. (Q27·Q28)
 */
export default function PendingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: pending = [] } = useGetPendingAsks();
  const { data: quota } = useGetAskQuota();
  const resolve = usePostResolveAsk();
  const remove = useDeleteSentence();
  const claim = usePostAdBonus();
  /**
   * 로그인 없이 쓰는 독자는 몫이 작다(약 5번). 그걸 다 쓴 여기가 로그인을 권하는 자리다 —
   * 더 묻고 싶은 순간이라 왜 로그인하는지가 저절로 설명된다. 광고 대신 로그인을 먼저
   * 내민다. 로그인하면 정식 몫이 생기고, 기다리던 문장도 그대로 옮겨 간다.
   */
  const anonymous = Boolean(useSession().reader?.anonymous);
  const [watching, setWatching] = useState(false);
  const left = quota?.remaining ?? 0;
  /** 하루 몫을 다 받았으면 광고를 보여 주기 전에 막는다 — 보고 나서 거절당하면 헛수고다 */
  const adsExhausted = quota?.adsLeftToday === 0;

  /**
   * 하나를 골라 다시 묻는다. 답이 오면 그 문장 화면을 뜻을 편 채로 연다 — 표현을
   * 고르는 자리가 거기라서다. 한동안 여기서 묻기만 하고 화면은 그대로여서, 답은
   * 왔는데 표현을 고를 길이 없었다.
   */
  async function open(askId: string) {
    if (resolve.isPending) return;
    try {
      const view = await resolve.mutateAsync(askId);
      if (view.ask.status === 'answered' && view.sentence) {
        router.push({
          pathname: '/sentence/[id]',
          params: { id: view.sentence._id, reveal: '1' },
        });
        return;
      }
      Alert.alert(
        view.ask.pendingReason === '질문 소진'
          ? '이번 달 질문을 다 쓰셨어요'
          : '아직 답을 받지 못했어요',
        view.ask.pendingReason === '질문 소진'
          ? '다음 달 1일에 다시 물어볼 수 있어요.'
          : '잠시 뒤에 다시 눌러주세요. 문장은 그대로 기다려요.',
      );
    } catch (error) {
      const failure = explainAskError(error);
      Alert.alert(failure.title, failure.message);
    }
  }

  /** 더 물어볼 필요가 없어진 문장 — 질문과 함께 지운다 */
  function confirmRemove(askId: string) {
    const sentenceId = pending.find((view) => view.ask._id === askId)?.sentence
      ?._id;
    if (!sentenceId || remove.isPending) return;
    Alert.alert('이 문장을 지울까요?', '기다리던 질문도 함께 지워져요.', [
      { text: '그대로 둘게요', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () =>
          remove.mutate(sentenceId, {
            onError: (error) =>
              Alert.alert(
                '지우지 못했어요',
                error instanceof Error ? error.message : '',
              ),
          }),
      },
    ]);
  }

  /** 광고를 끝까지 봤을 때만 서버에 보상을 청구한다 */
  async function watchAd() {
    setWatching(true);
    try {
      if (!(await showRewarded())) {
        Alert.alert(
          '광고를 보지 못했어요',
          '끝까지 보셔야 질문이 생겨요. 지금 보여줄 광고가 없을 수도 있으니 잠시 뒤에 다시 해주세요.',
        );
        return;
      }
      await claim.mutateAsync();
    } catch (error) {
      Alert.alert(
        '질문을 받지 못했어요',
        error instanceof Error ? error.message : '잠시 뒤에 다시 해주세요.',
      );
    } finally {
      setWatching(false);
    }
  }

  /** 마지막 하나를 풀고 나면 0개가 된다 — 그때 '0개가 기다린다'고 하지 않는다 */
  const notice = !pending.length
    ? {
        title: '기다리는 문장이 없어요',
        body: '담아둔 문장은 모두 풀렸어요.',
      }
    : left > 0
      ? {
          title: `문장 ${pending.length}개가 답을 기다리고 있어요`,
          /**
           * 무엇을 하면 되는지를 말한다 — 한동안 아래에 '가장 오래 기다린 문장부터' 버튼이
           * 있었는데, 광고로 질문을 받은 뒤 그 버튼을 또 눌러야 해서 무엇을 묻는지가
           * 흐려졌다. 독자가 묻고 싶은 문장을 직접 고른다.
           */
          body: '묻고 싶은 문장을 눌러서 물어보세요.',
        }
      : anonymous
        ? {
            title: '로그인하면 더 물어볼 수 있어요',
            body: '로그인 없이 쓸 수 있는 질문을 다 썼어요. 로그인하면 이번 달 질문이 더 생기고, 지금까지 담은 기록도 그대로 이어져요.',
            action: {
              label: '로그인하기',
              onPress: () => router.push('/sign-in'),
            },
          }
        : {
            title: '지금 바로 풀고 싶다면',
            body: adsExhausted
              ? '오늘 받을 수 있는 광고 보상을 모두 받았어요. 내일 다시 받을 수 있어요.'
              : '광고를 보면 문장을 더 물어볼 수 있어요.',
            action: {
              label: adsExhausted
                ? '오늘 보상을 모두 받았어요'
                : '광고 보고 질문 받기',
              loading: watching,
              disabled: adsExhausted,
              onPress: watchAd,
            },
          };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        leading="back"
        onLeadingPress={() => router.back()}
        title="기다리는 문장"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        /* 아래 버튼이 없어서 홈 인디케이터만큼은 목록이 직접 비켜 준다 */
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
        style={styles.scroll}
      >
        {/*
          안내는 하나만 선다 — 질문을 다 썼으면 광고(익명이면 로그인), 남았으면 '눌러서
          물어보세요'. 이 앱의 유일한 권유 자리다: 질문이 남아 있는데 광고를 내밀면 읽는 흐름
          속으로 들어온다. (ADR-0003) 세 상태가 한 양식(`NoticePanel`)을 쓴다.
        */}
        <NoticePanel {...notice} />

        <PendingList
          asks={pending.map((view) => ({
            id: view.ask._id,
            text: view.sentence?.text ?? '',
            page: view.sentence?.page,
            capturedLabel: savedLabel(view.ask.createdAt),
            reason: view.ask.pendingReason ?? '기다리는 중',
            /** 우리 쪽 문제로 못 풀었다 — 한도가 찬 것(질문 소진)과 구분한다 */
            failed:
              view.ask.pendingReason === '연결 실패' ||
              view.ask.pendingReason === '중간에 끊김',
            book: view.book ? toBook(view.book) : undefined,
          }))}
          onPressAsk={open}
          onRemove={confirmRemove}
          busyId={resolve.isPending ? resolve.variables : undefined}
        />
      </ScrollView>

      <AskingOverlay visible={resolve.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, gap: 16 },
});
