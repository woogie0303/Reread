import * as SecureStore from 'expo-secure-store';

import type { ProviderName } from '@/shared/api/types';

/**
 * 이 기기에서 마지막으로 로그인한 제공자. **로그아웃해도 지우지 않는다** — 두 군데가
 * 이걸 본다.
 *
 * - 앱을 열었는데 토큰이 없을 때: 한 번이라도 로그인한 기기면 익명으로 들이지 않고
 *   로그인 화면을 보인다. 익명으로 들어가면 원래 계정과 따로 노는 기록이 생긴다.
 * - 로그인 화면: 지난번에 쓴 버튼 위에 '최근 로그인'을 띄운다. 넷 중 무엇으로 가입했는지
 *   기억하지 못해서 다른 버튼을 누르면 빈 계정이 새로 생긴다.
 *
 * 읽지 못하면 없는 셈 친다 — 익명으로 들어가도 나중에 로그인하면 기록은 합쳐진다.
 */
const KEY = 'auth.lastProvider';

export async function readLastProvider(): Promise<ProviderName | null> {
  try {
    return (await SecureStore.getItemAsync(KEY)) as ProviderName | null;
  } catch {
    return null;
  }
}

export async function saveLastProvider(provider: ProviderName): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, provider);
  } catch {
    /* 못 적어도 '최근 로그인' 표시가 빠질 뿐이다 */
  }
}

/** 계정을 지웠을 때만 — 없는 계정의 버튼에 '최근 로그인'이 남으면 안 된다 */
export async function clearLastProvider(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* 못 지우면 다음 실행에 로그인 화면이 한 번 더 설 뿐이다 */
  }
}
