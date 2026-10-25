import { Alert } from 'react-native';

import { ApiError } from '@/shared/api/client';

/**
 * 로그인 없이 쓰는 독자가 담을 수 있는 문장을 다 채웠다(서버 `ANON_SENTENCE_LIMIT`, 403).
 * 오류가 아니라 로그인을 권하는 자리다 — 탭 바 위의 로그인 배너가 이미 하던 말을 한 번 더 한다.
 * 문장 담기가 쓰는 403은 이것 하나뿐이다. 남의 문서는 403이 아니라 404로 숨긴다.
 */
export function isAnonymousLimit(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function offerSignIn(onSignIn: () => void) {
  Alert.alert(
    '로그인하면 더 많은 문장을 저장할 수 있어요',
    '로그인 없이 담을 수 있는 문장을 다 채웠어요. 로그인하면 지금까지 담은 기록도 그대로 이어져요.',
    [
      { text: '나중에', style: 'cancel' },
      { text: '로그인하기', onPress: onSignIn },
    ],
  );
}
