import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useSession } from '@/shared/session/session';
import { markOnboardingSeen } from '@/widgets/onboarding/model/seen';
import { Onboarding } from '@/widgets/onboarding/ui/onboarding';

/**
 * 첫 실행 안내. 처음 온 기기에는 **로그인보다 먼저** 서고(`_layout`의 `Gate`), 그 밖에는
 * 마이 탭에서 들어온다.
 *
 * 끝내거나 건너뛰면 온 자리로 돌아간다 — 아직 로그인 전이면 돌아갈 자리가 없으므로
 * 로그인으로 보낸다.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { status } = useSession();

  /** 건너뛴 것도 본 것으로 적는다 — 건너뛴 사람에게 다음 실행에 또 내밀지 않는다 */
  const finish = useCallback(async () => {
    await markOnboardingSeen();
    if (status === 'out') router.replace('/sign-in');
    else router.back();
  }, [status, router]);

  return <Onboarding onFinish={finish} />;
}
