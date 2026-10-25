import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useGetAnonymousLimit } from '@/entities/sentence/api/sentence.api';
import { color, gutter, type } from '@/shared/config';
import { useSession } from '@/shared/session/session';
import { AppText, Icon, Tap } from '@/shared/ui';

/**
 * 로그인 없이 쓰는 독자에게 **좋아하는 문장을 5개 담았거나 문장 5개를 물어본 때부터** 떠 있는
 * 안내 — 세 탭 모두의 탭 바 위에 선다. 처음부터 띄우면 아직 써 보지도 않은 독자에게 로그인을
 * 내미는 셈이라, 더 담고 싶어질 즈음에야 말을 건다. 닫을 수 없다: 익명 기록은 앱을 지우면
 * 사라져서 로그인이 곧 기록을 지키는 일이다. 로그인하면 `anonymous`가 꺼지며 저절로 사라진다.
 *
 * 문장을 5개 넘게 담으려다 거절당했을 때(서버 `ANON_SENTENCE_LIMIT`)는 이미 이 배너가 서 있다.
 */
export function LoginBanner() {
  const router = useRouter();
  const { status, reader } = useSession();
  const anonymous = status === 'in' && Boolean(reader?.anonymous);
  const { data } = useGetAnonymousLimit(anonymous);
  if (!anonymous || !data?.anonymous) return null;
  if (data.kept < data.limit && data.asked < data.limit) return null;

  return (
    <Tap
      onPress={() => router.push('/sign-in')}
      accessibilityRole="button"
      accessibilityLabel="로그인하면 더 많은 문장을 저장할 수 있어요. 로그인하기"
      style={styles.banner}
    >
      <Icon name="sparkle" size={15} color={color.primary} />
      <AppText style={styles.text} numberOfLines={1}>
        로그인하면 더 많은 문장을 저장할 수 있어요
      </AppText>
      <View style={styles.action}>
        <AppText style={styles.actionLabel}>로그인</AppText>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: gutter,
    marginBottom: 8,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 12,
    backgroundColor: color.primaryTint,
  },
  text: {
    flex: 1,
    ...type.caption1,
    fontWeight: '600',
    color: color.text.primary,
  },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: color.primary,
  },
  actionLabel: {
    ...type.caption2,
    fontWeight: '700',
    color: color.text.onInk,
  },
});
