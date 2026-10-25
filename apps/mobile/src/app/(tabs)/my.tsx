import { useRouter } from 'expo-router';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGetAskQuota } from '@/entities/ask/api/ask.api';
import { usagePercent } from '@/entities/ask/lib/quota';
import { useGetItems } from '@/entities/lexical-item/api/item.api';
import {
  useDeleteAccount,
  useGetReader,
} from '@/entities/reader/api/reader.api';
import { useGetReadingWeek } from '@/entities/reading/api/reading.api';
import { PRIVACY_POLICY_URL, color, gutter, type } from '@/shared/config';
import { useSession } from '@/shared/session/session';
import {
  ActionButton,
  AltPanel,
  AppText,
  DisclosureRow,
  ProgressBar,
  showToast,
  Tap,
} from '@/shared/ui';
import { ReminderSettings } from '@/widgets/review-reminder/ui/reminder-settings';

/**
 * 마이 — 이번 달 사용량과, 쌓인 것들.
 *
 * 레벨은 없다. 한때 '내 레벨'을 맨 위에 두고 책을 끝낼 때마다 다시 물었는데,
 * 한국어 책과 영어 밖의 원서까지 담게 되면서 사람 하나에 레벨 하나가 맞지
 * 않게 됐다(`readers/reader.schema.ts`).
 *
 * 기다리는 문장은 여기 없다. 답을 기다리는 문장은 **할 일**이지 설정이 아니라서,
 * 문장이 사는 곳(서랍)에서 말을 건다 — 여기 두면 세 탭을 건너야 닿고, 줄이
 * 하나도 없을 땐 아예 보이지 않아서 있는 줄도 모른다.
 */
export default function MyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut, forget, reader: session } = useSession();
  /** 로그인 없이 쓰는 중 — 로그아웃하면 기록에 다시 닿을 길이 없어서 그 대신 로그인을 권한다 */
  const anonymous = Boolean(session?.anonymous);
  const deleteAccount = useDeleteAccount();
  const { data: reader } = useGetReader();
  const { data: items = [] } = useGetItems();
  const { data: quota } = useGetAskQuota();
  const { data: week } = useGetReadingWeek();
  const again = items.filter((i) => i.met > 1).length;
  const left = quota?.remaining ?? 0;
  const ratio = quota?.ratio ?? 0;
  const used = usagePercent(ratio);

  /** 되돌릴 수 없는 일은 한 번 묻는다 — 다시 들어오려면 로그인부터다 */
  const confirmSignOut = () =>
    Alert.alert(
      '로그아웃할까요?',
      '담아둔 것은 그대로 있어요. 다시 로그인하면 이어서 볼 수 있어요.',
      [
        { text: '그대로 둘게요', style: 'cancel' },
        { text: '로그아웃', style: 'destructive', onPress: signOut },
      ],
    );

  /**
   * 계정 삭제 — 로그아웃과 달리 되돌릴 수 없어서 무엇이 지워지는지를 그대로 말하고 한 번
   * 묻는다. 서버가 끝내면 기기에서도 로그아웃과 같은 길로 정리한다(토큰·캐시·알림).
   */
  const confirmDelete = () =>
    Alert.alert(
      '계정을 삭제할까요?',
      '담아둔 책과 문장, 표현, 읽은 기록이 모두 지워지고 되돌릴 수 없어요.',
      [
        { text: '그대로 둘게요', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () =>
            deleteAccount.mutate(undefined, {
              onSuccess: async () => {
                await forget();
                router.replace('/');
                showToast('계정을 삭제했어요');
              },
              onError: (error) =>
                Alert.alert(
                  '삭제하지 못했어요',
                  error instanceof Error
                    ? error.message
                    : '잠시 후 다시 시도해 주세요.',
                ),
            }),
        },
      ],
    );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <AppText style={styles.title}>마이</AppText>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.scroll}
      >
        {anonymous ? (
          <DisclosureRow
            title="로그인하기"
            body="로그인하면 담아둔 기록을 지키고, 이번 달 질문도 더 생겨요."
            onPress={() => router.push('/sign-in')}
          />
        ) : null}

        {/*
          사용량은 늘 보인다 — 숨겼다가 다 썼을 때 처음 보이면 독자는 속았다고 느낀다.
          금액도 횟수도 아니라 쓴 비율로만 말한다(`usagePercent`). 0%에서 시작해 물을
          때마다 그 질문이 실제로 쓴 만큼 오른다.
        */}
        <AltPanel style={styles.quotaPanel}>
          <View style={styles.quotaHead}>
            <AppText style={styles.quotaLabel}>이번 달 사용량</AppText>
            <AppText style={styles.quotaValue}>{used}%</AppText>
          </View>
          <ProgressBar
            value={ratio}
            fill={ratio >= 0.8 ? color.status.cautionary : color.primary}
          />
          {left > 0 ? (
            <AppText style={styles.quotaHint}>
              {used === 0
                ? '물어볼 때마다 쓴 만큼 올라가요.'
                : '한 번에 여러 문장을 물으면 조금 더 올라가요.'}
            </AppText>
          ) : (
            <AppText style={styles.quotaHint}>
              다 쓰셨어요. 담은 문장은 다음 달에 다시 물어볼 수 있어요.
            </AppText>
          )}
        </AltPanel>

        <AltPanel style={styles.statsPanel}>
          <Row label="담아둔 표현" value={`${items.length}개`} />
          <Row label="다시 만난 표현" value={`${again}개`} />
          <Row label="이번 주에 읽은 날" value={`${week?.days ?? 0}일`} />
          <Row label="다 읽은 책" value={`${reader?.booksFinished ?? 0}권`} />
        </AltPanel>

        <ReminderSettings />

        <DisclosureRow
          title="사용 방법"
          body="찍고, 묻고, 다시 만나는 흐름을 다시 볼 수 있어요."
          onPress={() => router.push('/onboarding')}
        />

        <DisclosureRow
          title="개인정보 처리방침"
          onPress={() =>
            Linking.openURL(PRIVACY_POLICY_URL).catch(() =>
              Alert.alert('열지 못했어요', '잠시 뒤에 다시 시도해 주세요.'),
            )
          }
        />

        {/* 나가는 문은 쌓인 것들과 한 덩어리로 두지 않는다 */}
        {anonymous ? null : (
          <View style={styles.exit}>
            <ActionButton
              label="로그아웃"
              variant="subtle"
              onPress={confirmSignOut}
            />
          </View>
        )}

        {/*
          되돌릴 수 없는 일은 눈에 띄는 버튼으로 세우지 않고, 찾으면 닿는 곳에 조용히 둔다.
          익명 독자에게는 지울 계정이 없다 — 만든 적 없는 계정을 지우라는 말은 어색하고,
          그만 쓰려면 앱을 지우면 된다.
        */}
        {anonymous ? null : (
          <Tap
            onPress={confirmDelete}
            disabled={deleteAccount.isPending}
            accessibilityRole="button"
            accessibilityLabel="계정 삭제"
            style={styles.delete}
          >
            <AppText style={styles.deleteLabel}>
              {deleteAccount.isPending ? '삭제하는 중…' : '계정 삭제'}
            </AppText>
          </Tap>
        )}
      </ScrollView>
    </View>
  );
}

/** 조금이라도 썼으면 0%로 보이지 않게, 넘쳤어도 100%를 넘기지 않게 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText style={styles.rowLabel}>{label}</AppText>
      <AppText style={styles.rowValue}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  header: { paddingHorizontal: gutter, paddingBottom: 14 },
  title: { ...type.title3, color: color.text.primary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: 24, gap: 12 },

  quotaPanel: { padding: 18, gap: 10 },
  quotaHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  quotaLabel: { ...type.label2, fontWeight: '700', color: color.text.primary },
  quotaValue: { ...type.label2, color: color.text.meta },
  quotaHint: { ...type.caption2, color: color.text.secondary, flex: 1 },

  statsPanel: { padding: 18, gap: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  rowLabel: { ...type.label1, color: color.text.secondary },
  rowValue: { ...type.label1, fontWeight: '700', color: color.text.primary },

  exit: { marginTop: 12 },
  delete: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  deleteLabel: { ...type.label2, color: color.status.negative },
});
