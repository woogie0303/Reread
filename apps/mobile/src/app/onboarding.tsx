import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useSession } from '@/shared/session/session';
import { markOnboardingSeen } from '@/widgets/onboarding/model/seen';
import { Onboarding } from '@/widgets/onboarding/ui/onboarding';

/**
 * 첫 실행 안내. 처음 온 기기에는 앱이 열리자마자 서고(`_layout`의 `Gate`), 그 밖에는
 * 마이 탭에서 들어온다.
 *
 * 끝내거나 건너뛰면 온 자리로 돌아간다. 처음 열려서 돌아갈 자리가 없으면 — 익명으로
 * 들어갔으면 홈, 이 기기에서 로그인했던 사람이면 로그인으로 간다.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { status } = useSession();

  /** 건너뛴 것도 본 것으로 적는다 — 건너뛴 사람에게 다음 실행에 또 내밀지 않는다 */
  const finish = useCallback(async () => {
    await markOnboardingSeen();
    if (status === 'out') router.replace('/sign-in');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [status, router]);

  return <Onboarding onFinish={finish} />;
}
