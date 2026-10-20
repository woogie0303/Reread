import * as SecureStore from 'expo-secure-store';

/**
 * 안내를 봤는지는 **기기마다** 적는다. 안내가 로그인보다 앞에 서기 때문에 적는
 * 시점에는 아직 독자가 누구인지 모른다 — 이 앱이 무엇을 하는 앱인지 보여주는
 * 일이라 계정이 아니라 기기에 매이는 것이 맞다.
 */
const KEY = 'onboarding.seen';

/**
 * 읽지 못하면 **봤다고 친다** — 안내가 길을 막는 일은 없어야 한다. 한 번 더 보여주는 것보다
 * 못 보여주는 쪽이 싸다(마이 탭에서 언제든 다시 열 수 있다).
 */
export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, '1');
  } catch {
    /* 못 적어도 안내를 한 번 더 보게 될 뿐이다 */
  }
}
