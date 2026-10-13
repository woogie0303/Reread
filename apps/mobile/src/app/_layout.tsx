import '@/global.css';

import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { color } from '@/shared/config';
import { configureNotifications } from '@/shared/notifications/reminder';
import { QueryProvider } from '@/shared/query/provider';
import { initMonitoring, wrapRoot } from '@/shared/monitoring/sentry';
import { SessionProvider, useSession } from '@/shared/session/session';
import { ToastHost } from '@/shared/ui';
import { OnboardingRedirect } from '@/widgets/onboarding/model/onboarding-redirect';

initMonitoring();
SplashScreen.preventAutoHideAsync();
configureNotifications();

/**
 * Reread는 흰 종이 위에서만 산다 — 화면은 라이트 하나뿐이다.
 * (디자인의 여섯 화면 모두 종이 바탕 위 잉크·포인트 색의 대비를 쓴다.)
 */
function RootLayout() {
  return (
    /* 촬영 시트의 손잡이가 끌기를 받는다(`widgets/capture/ui/ask-sheet`) */
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Gate />
          {/* 뒤로 가며 한 일을 알린다 — 화면이 사라져도 남아야 해서 네비게이션 바깥에 둔다 */}
          <ToastHost />
        </SessionProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);

/**
 * 로그인 여부에 따라 문을 갈라놓는다.
 *
 * 세션이 정해지기 전에는 스플래시를 내리지 않는다 — 잠깐 로그인 화면이
 * 스쳤다가 홈으로 넘어가는 것이 앱이 고장난 것처럼 보이기 때문이다.
 */
function Gate() {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();

  /**
   * 복습 알림을 눌러 앱이 열렸으면(꺼져 있던 앱도 포함) 알림이 말한 그 표현으로 간다.
   * 로그인이 정해진 뒤에만 — 로그인 전에 밀어 넣으면 문이 그 길을 되돌려 보낸다.
   * 같은 응답을 두 번 처리하지 않도록 어느 알림이었는지(시각까지)를 기억해 둔다.
   */
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'in' || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
      return;

    const { identifier, content } = response.notification.request;
    const key = `${identifier}:${response.notification.date}`;
    const itemId = content.data?.itemId;
    if (handled.current === key || typeof itemId !== 'string') return;

    handled.current = key;
    router.push({ pathname: '/item/[id]', params: { id: itemId } });
  }, [response, status, router]);

  useEffect(() => {
    if (status === 'loading') return;

    SplashScreen.hideAsync();
    const atSignIn = segments[0] === 'sign-in';
    if (status === 'out' && !atSignIn) router.replace('/sign-in');
    if (status === 'in' && atSignIn) router.replace('/');
  }, [status, segments, router]);

  return (
    <>
      {/* 처음 온 독자를 안내로 — 서버를 부르는 훅이 들어 있어 로그인한 뒤에만 세운다 */}
      {status === 'in' ? <OnboardingRedirect /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.surface.base },
        }}
      >
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        {/*
        책 추가는 화면을 다 차지할 일이 없다 — 고를 것이 둘뿐이라, 꽉 찬 모달로
        띄우면 아래가 통째로 빈다. 투명 모달로 띄우고 제 높이만 쓰는 시트를
        직접 그린다(`book-pick`). 뒤가 비치므로 바깥을 눌러 나갈 수 있다.
      */}
        <Stack.Screen
          name="book-pick"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            /**
             * 위의 screenOptions가 모든 화면에 불투명 종이색을 칠한다. 여기서
             * 덮어쓰지 않으면 이 화면 뒤는 항상 그 불투명한 색이라, 시트 뒤로
             * 드러나야 할 이전 화면이 하나도 비치지 않는다.
             */
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="book-add" />
        <Stack.Screen name="book-edit" />
        <Stack.Screen name="book-search" />
        <Stack.Screen name="ask" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scan" />
        <Stack.Screen name="pending" />
        <Stack.Screen name="genres" />
        {/* 밀어서 닫으면 '봤다'가 적히지 않는다 — 버튼으로만 끝낸다 */}
        <Stack.Screen
          name="onboarding"
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
  );
}
