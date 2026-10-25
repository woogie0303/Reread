import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { color, gutter, type } from '@/shared/config';
import { useSession } from '@/shared/session/session';
import { AppText, Icon, Tap } from '@/shared/ui';

/**
 * 로그인 없이 쓰는 독자에게 늘 떠 있는 안내 — 세 탭 모두의 탭 바 위에 선다.
 * 닫을 수 없다: 익명 기록은 앱을 지우면 사라져서, 로그인이 곧 기록을 지키는 일이다.
 * 로그인하면 `anonymous`가 꺼지며 저절로 사라진다.
 *
 * 문장을 5개 넘게 담으려다 거절당했을 때도 같은 말을 한다(서버 `ANON_SENTENCE_LIMIT`) —
 * 이미 보고 있던 말이라 거절이 갑작스러운 벽으로 느껴지지 않는다.
 */
export function LoginBanner() {
  const router = useRouter();
  const { status, reader } = useSession();
  if (status !== 'in' || !reader?.anonymous) return null;

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
