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
import { usagePercent } from '@/entities/ask/lib/quota';
import { toBook } from '@/entities/book/api/book.api';
import { useDeleteSentence } from '@/entities/sentence/api/sentence.api';
import { showRewarded } from '@/shared/ads/ads';
import { color, gutter, type } from '@/shared/config';
import { savedLabel } from '@/shared/lib/date';
import {
  ActionButton,
  AltPanel,
  AppText,
  AskingOverlay,
  Icon,
  ScreenHeader,
} from '@/shared/ui';
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
  const [watching, setWatching] = useState(false);
  const left = quota?.remaining ?? 0;
  /** 하루 몫을 다 받았으면 광고를 보여 주기 전에 막는다 — 보고 나서 거절당하면 헛수고다 */
  const adsExhausted = quota?.adsLeftToday === 0;
  const oldest = pending[pending.length - 1];

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

  return (
    <View style={styles.screen}>
      <ScreenHeader
        leading="back"
        onLeadingPress={() => router.back()}
        title="기다리는 문장"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.scroll}
      >
        {/*
          이 앱의 유일한 권유 자리. 이번 달 질문을 다 쓴 독자에게만 선다 —
          남아 있는데 광고를 내밀면 읽는 흐름 속으로 들어온다. (ADR-0003)
        */}
        {pending.length && left === 0 ? (
          <AltPanel style={styles.rewarded}>
            <View style={styles.rewardedHead}>
              <Icon name="sparkle" size={15} color={color.primary} />
              <AppText style={styles.rewardedTitle}>
                지금 바로 풀고 싶다면
              </AppText>
            </View>
            <AppText style={styles.rewardedBody}>
              {adsExhausted
                ? '오늘 받을 수 있는 광고 보상을 모두 받았어요. 내일 다시 받을 수 있어요.'
                : '광고를 보면 문장을 더 물어볼 수 있어요.'}
            </AppText>
            <ActionButton
              label={
                adsExhausted
                  ? '오늘 보상을 모두 받았어요'
                  : '광고 보고 질문 받기'
              }
              variant="subtle"
              loading={watching}
              disabled={adsExhausted}
              onPress={watchAd}
            />
          </AltPanel>
        ) : null}

        {/* 마지막 하나를 풀고 나면 0개가 된다 — 그때 '0개가 기다린다'고 하지 않는다 */}
        {left > 0 || !pending.length ? (
          <AltPanel style={styles.hero}>
            <AppText style={styles.heroTitle}>
              {pending.length
                ? `문장 ${pending.length}개가\n답을 기다리고 있어요`
                : '기다리는 문장이\n없어요'}
            </AppText>
            <AppText style={styles.heroBody}>
              {!pending.length
                ? '담아둔 문장은 모두 풀렸어요.'
                : `이번 달 사용량 ${usagePercent(quota?.ratio)}%. 하나씩 풀어볼까요?`}
            </AppText>
          </AltPanel>
        ) : null}

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

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <ActionButton
          label={
            !pending.length
              ? '다 풀었어요'
              : left > 0
                ? '가장 오래 기다린 문장부터'
                : '다음 달까지 그대로 둘게요'
          }
          variant={pending.length && left > 0 ? 'primary' : 'ink'}
          loading={resolve.isPending}
          onPress={() => {
            if (pending.length && left > 0 && oldest) open(oldest.ask._id);
            else router.back();
          }}
        />
      </View>

      <AskingOverlay visible={resolve.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: 24, gap: 16 },
  /** 말이 가운데에 선다 — 왼쪽에 붙으면 오른쪽이 빈다 */
  hero: {
    paddingVertical: 26,
    paddingHorizontal: 22,
    gap: 10,
    alignItems: 'center',
  },
  heroTitle: {
    ...type.heading1,
    fontWeight: '700',
    color: color.text.primary,
    lineHeight: 30,
    textAlign: 'center',
  },
  heroBody: {
    ...type.label2,
    lineHeight: 21,
    color: color.text.secondary,
    textAlign: 'center',
  },
  rewarded: { padding: 16, gap: 10 },
  rewardedHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rewardedTitle: {
    flex: 1,
    ...type.label2,
    fontWeight: '700',
    color: color.text.primary,
  },
  rewardedBody: { ...type.label2, lineHeight: 21, color: color.text.secondary },
  footer: { paddingHorizontal: gutter, paddingTop: 12 },
});
