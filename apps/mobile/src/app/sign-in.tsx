import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';

import type { ProviderName } from '@/shared/api/types';
import { color, gutter, type } from '@/shared/config';
import { readLastProvider } from '@/shared/session/last-provider';
import {
  configured,
  isReviewModeEnabled,
  SignInCancelled,
  SignInFailed,
} from '@/shared/session/oauth';
import { useSession } from '@/shared/session/session';
import { AppText, BRAND, BrandLogo, Icon, Mark, Tap } from '@/shared/ui';

/**
 * 한국 독자가 가장 많이 쓰는 순서. Apple은 크기와 자리가 다른 것과 같아야 한다 —
 * 더 작거나 구석에 두면 심사에서 걸린다(Apple 로그인 가이드라인).
 */
const PROVIDERS: ProviderName[] = ['kakao', 'naver', 'google', 'apple'];

/**
 * 로그인 — 가입과 로그인을 나누지 않는다. 처음 온 계정이면 독자를 만들고
 * 아니면 있던 독자로 이어진다. 비밀번호는 만들지 않는다.
 *
 * 버튼은 글자 없이 로고만 둔다. 넷을 "○○로 계속하기"로 쌓으면 화면 아래 절반이
 * 버튼으로 차서, 위의 문장(이 앱이 무엇인지)보다 버튼이 먼저 읽힌다. 로고는
 * 모두 알아보는 모양이라 글자가 없어도 뜻이 선다 — 스크린리더에는 이름을 준다.
 *
 * 두 길로 온다. **로그인 없이 쓰던 독자가 스스로 열었으면** 닫고 돌아갈 수 있고,
 * 로그인하면 쓰던 기록이 그 계정으로 옮겨진다. **이 기기에서 로그인했던 사람이
 * 돌아왔으면** 문처럼 선다 — 익명으로 들어가면 원래 계정과 따로 노는 기록이 생긴다.
 *
 * 지난번에 쓴 버튼 위에는 '최근 로그인'을 띄운다. 넷 중 무엇으로 가입했는지 잊고 다른
 * 버튼을 누르면 빈 계정이 새로 생긴다.
 */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, reader, signIn, reviewSignIn, problem } = useSession();
  /** 익명으로 쓰다 스스로 연 화면 — 닫고 돌아갈 수 있다 */
  const browsing = status === 'in' && Boolean(reader?.anonymous);
  const [recent, setRecent] = useState<ProviderName | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewUsername, setReviewUsername] = useState('');
  const [reviewPassword, setReviewPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    isReviewModeEnabled().then(setReviewMode);
    readLastProvider().then(setRecent);
  }, []);

  const onSignInError = (error: Error) => {
    if (error instanceof SignInCancelled) return;
    if (error instanceof SignInFailed) {
      Alert.alert('로그인하지 못했어요', error.message);
      return;
    }
    Alert.alert('로그인하지 못했어요', error.message);
  };

  const providerMutation = useMutation({
    mutationFn: (provider: ProviderName) => signIn(provider),
    onError: onSignInError,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      reviewSignIn(username, password),
    onError: onSignInError,
    onSuccess: () => setReviewModalVisible(false),
  });

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {browsing ? (
        <Tap
          hitSlop={12}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="닫기"
          style={[styles.close, { top: insets.top + 6 }]}
        >
          <Icon name="close" size={20} color={color.text.primary} />
        </Tap>
      ) : null}

      <View style={styles.head}>
        <Mascot />
        <Animated.View
          entering={FadeInDown.delay(120).duration(360)}
          style={styles.words}
        >
          <AppText style={styles.wordmark}>Reread</AppText>
          <AppText style={styles.blurb}>
            {browsing
              ? '로그인하면 담아둔 기록을\n다른 기기에서도 이어 볼 수 있어요'
              : '책을 읽다 막힌 문장, 여기에 두고 가세요'}
          </AppText>
        </Animated.View>
      </View>

      <View style={styles.foot}>
        {/* 자동으로 들어가려다 막혔으면 왜인지 그대로 보여준다 — 대개 백엔드가 꺼져 있다 */}
        {problem ? <AppText style={styles.problem}>{problem}</AppText> : null}

        {reviewMode ? (
          <Tap
            style={styles.reviewLoginBtn}
            accessibilityLabel="아이디·비밀번호로 로그인"
            onPress={() => setReviewModalVisible(true)}
          >
            <AppText style={styles.reviewLoginBtnText}>로그인하기</AppText>
          </Tap>
        ) : null}

        <View style={styles.divider} accessibilityRole="header">
          <View style={styles.rule} />
          <AppText style={styles.dividerText}>간편 로그인</AppText>
          <View style={styles.rule} />
        </View>

        <View style={styles.row}>
          {PROVIDERS.map((name) => (
            <ProviderButton
              key={name}
              name={name}
              ready={configured(name)}
              recent={recent === name}
              loading={providerMutation.isPending && providerMutation.variables === name}
              locked={
                (providerMutation.isPending && providerMutation.variables !== name) ||
                reviewMutation.isPending
              }
              onPress={() => providerMutation.mutate(name)}
            />
          ))}
        </View>

      </View>

      {reviewMode ? (
        <Modal
          visible={reviewModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setReviewModalVisible(false)}
        >
          <Pressable style={styles.overlay} onPress={Keyboard.dismiss}>
            <Pressable>
            <View style={styles.sheet}>
              <AppText style={styles.sheetTitle}>로그인</AppText>
              <TextInput
                style={styles.reviewInput}
                placeholder="아이디"
                placeholderTextColor={color.text.meta}
                value={reviewUsername}
                onChangeText={setReviewUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!reviewMutation.isPending}
              />
              <TextInput
                ref={passwordRef}
                style={styles.reviewInput}
                placeholder="비밀번호"
                placeholderTextColor={color.text.meta}
                value={reviewPassword}
                onChangeText={setReviewPassword}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (reviewUsername && reviewPassword && !reviewMutation.isPending) {
                    reviewMutation.mutate({ username: reviewUsername, password: reviewPassword });
                  }
                }}
                editable={!reviewMutation.isPending}
              />
              <Tap
                style={[
                  styles.reviewBtn,
                  (!reviewUsername ||
                    !reviewPassword ||
                    providerMutation.isPending ||
                    reviewMutation.isPending) &&
                    styles.reviewBtnOff,
                ]}
                accessibilityLabel="심사용 계정으로 로그인"
                onPress={() =>
                  reviewMutation.mutate({ username: reviewUsername, password: reviewPassword })
                }
                disabled={
                  !reviewUsername ||
                  !reviewPassword ||
                  providerMutation.isPending ||
                  reviewMutation.isPending
                }
              >
                {reviewMutation.isPending ? (
                  <ActivityIndicator color={color.text.onInk} />
                ) : (
                  <AppText style={styles.reviewBtnText}>로그인</AppText>
                )}
              </Tap>
              <Tap
                style={styles.cancelBtn}
                onPress={() => setReviewModalVisible(false)}
                disabled={reviewMutation.isPending}
              >
                <AppText style={styles.cancelBtnText}>취소</AppText>
              </Tap>
            </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

/**
 * 책을 읽는 캐릭터 — 이 앱의 얼굴이 처음 인사하는 자리. 천천히 떠올랐다 내려앉는다.
 * 눈에 띄려는 움직임이 아니라 '살아 있다'는 정도라서 느리고 작다. '동작 줄이기'를
 * 켰으면 가만히 있는다.
 */
function Mascot() {
  const reduce = useReducedMotion();
  const lift = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    lift.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(lift);
  }, [reduce, lift]);

  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * lift.value }],
  }));
  const shadow = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 - 0.14 * lift.value }],
    opacity: 0.14 - 0.05 * lift.value,
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(420)}
      style={styles.mascot}
      accessible
      accessibilityRole="image"
      accessibilityLabel="책을 읽고 있는 Reread의 캐릭터"
    >
      <Animated.View style={body}>
        <Mark name="reading" size={132} />
      </Animated.View>
      <Animated.View style={[styles.shadow, shadow]} />
    </Animated.View>
  );
}

/**
 * 로고 하나짜리 동그란 버튼.
 *
 * 아직 쓸 수 없는 제공자(키가 없거나, Apple처럼 이 빌드에 권한이 없는 것)는
 * 흐리게 두고 누르지 못하게 한다 — 숨기지 않는다. 사라지면 '이 앱은 Apple
 * 로그인이 없구나'로 읽히고, 흐리면 '아직 안 됨'으로 읽힌다.
 */
function ProviderButton({
  name,
  ready,
  recent,
  loading,
  locked,
  onPress,
}: {
  name: ProviderName;
  ready: boolean;
  /** 이 기기에서 지난번에 쓴 제공자 */
  recent: boolean;
  loading: boolean;
  /** 다른 제공자로 로그인하는 중 — 두 창이 겹쳐 뜨지 않게 막는다 */
  locked: boolean;
  onPress: () => void;
}) {
  const brand = BRAND[name];
  const off = !ready || locked || loading;
  /** 로딩 표시는 로고와 같은 색으로 — 노란 바탕에 흰 스피너는 안 보인다 */
  const spinner = name === 'naver' || name === 'apple' ? '#FFFFFF' : '#000000';

  return (
    <View style={styles.slot}>
      {/* 버튼 위에 얹는다 — 줄에 끼우면 이 버튼만 아래로 밀려 넷의 높이가 어긋난다 */}
      {recent ? (
        <View style={styles.recentRail} pointerEvents="none">
          <View style={styles.recent}>
            <AppText style={styles.recentLabel} numberOfLines={1}>
              최근 로그인
            </AppText>
          </View>
          {/* 말풍선 꼬리 — 아래 버튼을 가리킨다 */}
          <View style={styles.recentTail} />
        </View>
      ) : null}
      <Tap
        onPress={onPress}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={
          (ready ? `${brand.label}로 로그인` : `${brand.label}로 로그인, 준비 중`) +
          (recent ? ', 최근에 쓴 방법' : '')
        }
        accessibilityState={{ disabled: off, busy: loading }}
        style={[
          styles.circle,
          { backgroundColor: brand.background },
          brand.border ? { borderWidth: 1, borderColor: brand.border } : null,
          !ready ? styles.unready : null,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={spinner} />
        ) : (
          <BrandLogo name={name} />
        )}
      </Tap>
    </View>
  );
}

const CIRCLE = 56;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: gutter,
    backgroundColor: color.surface.base,
  },
  /** 남는 자리의 가운데에 선다 — 위에 붙이면 아래 로그인 버튼과 사이가 휑하다 */
  head: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 },
  mascot: { alignItems: 'center' },
  shadow: {
    width: 76,
    height: 9,
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: color.text.primary,
  },
  words: { alignItems: 'center', gap: 14 },
  wordmark: {
    ...type.title2,
    fontSize: 32,
    letterSpacing: -0.96,
    color: color.text.primary,
  },
  blurb: {
    ...type.label1,
    lineHeight: 24,
    textAlign: 'center',
    color: color.text.secondary,
  },
  /** 책에서 온 영어만 세리프. 인사말이 아니라 곁들이는 인용이라 작고 옅게 */
  line: {
    marginTop: 6,
    paddingHorizontal: 12,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    color: color.text.meta,
  },

  foot: { gap: 20 },
  problem: { ...type.caption1, lineHeight: 18, color: color.status.cautionary },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.default,
  },
  dividerText: { ...type.caption1, color: color.text.secondary },

  /** 위 여백은 '최근 로그인' 표시가 '간편 로그인' 줄에 닿지 않을 만큼 */
  row: { flexDirection: 'row', justifyContent: 'center', gap: 18, paddingTop: 16 },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 아직 쓸 수 없는 것 — 브랜드 색은 지키되 흐리게 */
  unready: { opacity: 0.32 },

  slot: { alignItems: 'center' },
  /**
   * 버튼 바로 위, 가운데. 절대 위치로 띄운 것은 부모(버튼 폭 56) 안에서 줄을 바꿔서
   * '최근 로/그인'으로 꺾였다 — 양옆으로 넓힌 칸에 얹고 그 가운데에 세운다.
   */
  recentRail: {
    position: 'absolute',
    bottom: CIRCLE + 4,
    left: -30,
    right: -30,
    alignItems: 'center',
  },
  /** 말풍선 몸통. 꼬리보다 위에 그려야 꼬리의 윗모서리가 보이지 않는다 */
  recent: {
    zIndex: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: color.primary,
  },
  /** 같은 색 정사각형을 45도 돌려 아랫모서리만 드러낸다 */
  recentTail: {
    width: 8,
    height: 8,
    marginTop: -5,
    backgroundColor: color.primary,
    transform: [{ rotate: '45deg' }],
  },
  recentLabel: {
    ...type.caption2,
    fontWeight: '600',
    color: color.text.onInk,
  },

  close: { position: 'absolute', left: gutter, zIndex: 1 },

  reviewLoginBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: color.primary,
  },
  reviewLoginBtnText: {
    ...type.label1,
    color: color.primary,
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28,25,21,0.48)',
    justifyContent: 'center',
    paddingHorizontal: gutter,
  },
  sheet: {
    backgroundColor: color.surface.base,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  sheetTitle: {
    ...type.title3,
    color: color.text.primary,
    marginBottom: 4,
  },

  reviewInput: {
    ...type.body2,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border.default,
    color: color.text.primary,
    backgroundColor: color.surface.base,
  },
  reviewBtn: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primary,
  },
  reviewBtnOff: { opacity: 0.4 },
  reviewBtnText: { ...type.label1, color: color.text.onInk },
  cancelBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    ...type.body2,
    color: color.text.secondary,
  },
});
