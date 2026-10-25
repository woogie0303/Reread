import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import { AppTabBar } from '@/widgets/app-tab-bar/ui/app-tab-bar';
import { LoginBanner } from '@/widgets/login-banner/ui/login-banner';
import { useReminderSync } from '@/widgets/review-reminder/model/use-reminder';

/**
 * 홈 · 서랍 · 마이. 탭 바는 디자인 그대로 직접 그린다(`widgets/app-tab-bar`).
 * 어느 탭에서도 물러나지 않는다 — 탭 바가 사라지면 나가는 길이 헤더 하나뿐이 된다.
 * 로그인 없이 쓰는 독자에게는 탭 바 바로 위에 로그인 배너가 늘 떠 있다(`LoginBanner`).
 *
 * 퀴즈는 MVP에서 뺐다. 만들다 만 게 아니라 이번 출시엔 안 낸다는 결정이다.
 */
export default function TabsLayout() {
  /** 복습 알림 이레치 예약을 새로 짠다 — 로그인한 뒤 탭에 들어와 있을 때만 돈다 */
  useReminderSync();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <View>
          <LoginBanner />
          <AppTabBar {...props} />
        </View>
      )}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="drawer" options={{ title: '서랍' }} />
      <Tabs.Screen name="my" options={{ title: '마이' }} />
    </Tabs>
  );
}
