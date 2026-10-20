import * as apple from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api, baseUrl } from '@/shared/api/client';
import type { ProviderName, SignInResult } from '@/shared/api/types';

/**
 * 소셜 로그인.
 *
 * **카카오·네이버·구글**은 브라우저 동의 화면 + 서버 콜백으로 들어온다
 * (`browserSignIn`). 예전엔 제공자별 네이티브 SDK를 썼는데 두 가지가
 * 발목을 잡았다 — 네이버 client secret이 `EXPO_PUBLIC_`으로 앱 번들에
 * 그대로 노출됐고(네이버 SDK 설계상 피할 수 없었다), 네이버는 토큰이
 * 우리 앱 것인지 대조할 수단 자체가 없었다. 시크릿을 서버에만 두면 둘 다
 * 사라진다.
 *
 * 한동안 `expo-auth-session`으로 이 방식을 직접 시도했다가 접은 적이 있다 —
 * **구글이 앱의 커스텀 스킴(`reread://…`)을 redirect URI로 등록하는 것을
 * 정책으로 막았다.** 지금은 그 문제를 비켜 간다: 구글이 보는 redirect URI는
 * 언제나 이 서버의 `https://…/callback`이고, 커스텀 스킴은 서버가 로그인을
 * 끝낸 뒤 앱으로 돌아올 때만(브라우저 → 딥링크) 한 번 더 쓰인다.
 *
 * 딥링크에는 액세스 토큰을 싣지 않는다. 서버가 만든 1회용 **티켓**만 싣고,
 * 앱은 그 티켓과 자기만 아는 PKCE `code_verifier`를 들고 `/auth/exchange`로
 * 가야 진짜 토큰을 받는다 — 토큰을 딥링크에 실으면 기기의 다른 앱이나
 * 브라우저 히스토리에 남을 수 있어서다.
 *
 * **Apple**만 다르다. iOS 시스템 창이 앱에 identityToken을 바로 주므로
 * 브라우저를 타지 않는다.
 */

/** 모든 제공자는 개발·출시 빌드에서 항상 쓸 수 있다 */
export function configured(_provider: ProviderName): boolean {
  return true;
}

/** 사용자가 동의 화면을 그냥 닫은 것 — 오류가 아니다 */
export class SignInCancelled extends Error {}

/**
 * 동의 화면까지 가지도 못했거나 제공자가 거절한 것.
 *
 * 취소와 묶어 던지면 화면이 조용히 아무것도 안 한다 — 사용자가 닫은 것과
 * 제공자가 거절한 것이 같은 모양이 되기 때문이다.
 */
export class SignInFailed extends Error {
  constructor(
    message: string,
    readonly detail: { provider: ProviderName; raw?: string },
  ) {
    super(message);
  }
}

export async function signInWith(
  provider: ProviderName,
): Promise<SignInResult> {
  if (provider === 'apple') return appleSignIn();
  return browserSignIn(provider);
}

/**
 * Apple이 준 이름을 한 줄로. 한글 이름은 성과 이름을 붙여 쓰고(강동욱), 그 밖에는
 * 이름 먼저 띄어 쓴다(John Smith).
 */
function joinName(
  given: string | null,
  family: string | null,
): string | undefined {
  if (!given && !family) return undefined;
  const hangul = /[가-힣]/.test(`${given ?? ''}${family ?? ''}`);
  return hangul
    ? `${family ?? ''}${given ?? ''}`
    : [given, family].filter(Boolean).join(' ');
}

async function appleSignIn(): Promise<SignInResult> {
  let credential: Awaited<ReturnType<typeof apple.signInAsync>>;
  try {
    credential = await apple.signInAsync({
      requestedScopes: [
        apple.AppleAuthenticationScope.FULL_NAME,
        apple.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    if (cancelled(error)) throw new SignInCancelled();
    throw new SignInFailed('Apple 로그인을 마치지 못했어요.', {
      provider: 'apple',
      raw: String(error).slice(0, 300),
    });
  }

  if (!credential.identityToken) {
    throw new SignInFailed('Apple이 identityToken을 주지 않았어요.', {
      provider: 'apple',
    });
  }

  /** 이름은 **처음 로그인할 때만** 온다. 두 번째부터는 비어 있고, 서버는 이미
   * 저장해 둔 이름을 쓴다. */
  const name = credential.fullName;
  return api<SignInResult>('/auth/apple', {
    method: 'POST',
    anonymous: true,
    body: {
      idToken: credential.identityToken,
      nickname:
        name?.nickname ??
        joinName(name?.givenName ?? null, name?.familyName ?? null),
      /** 서버가 refresh token으로 바꿔 두었다가 계정을 지울 때 Apple 연결을 끊는다 */
      authorizationCode: credential.authorizationCode ?? undefined,
    },
  });
}

/** SDK마다 취소를 다른 모양으로 알린다 — 전부 '닫았다'로 모은다 */
function cancelled(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === 'ERR_REQUEST_CANCELED' || code === '-5' || /cancel/i.test(message)
  );
}

/**
 * 42~128자, RFC 7636이 허용하는 문자(A-Z a-z 0-9 - . _ ~)만으로 된 무작위
 * 문자열. UUID 셋을 이어 붙이면 하이픈 섞인 108자가 나온다 — base64
 * 인코딩 없이 바로 쓸 수 있어서 이렇게 만든다. 넷을 이으면 144자로 서버의
 * MaxLength(128)을 넘긴다.
 */
function randomVerifier(): string {
  return Crypto.randomUUID() + Crypto.randomUUID() + Crypto.randomUUID();
}

/** 표준 base64 → base64url(패딩 없음). expo-crypto는 표준 base64만 준다 */
function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function challengeFrom(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return toBase64Url(digest);
}

/**
 * 카카오·네이버·구글 — 브라우저 동의 화면을 열고, 서버가 만들어 돌려주는
 * 딥링크에서 1회용 티켓을 받아 `/auth/exchange`로 바꾼다.
 */
async function browserSignIn(
  provider: 'kakao' | 'naver' | 'google',
): Promise<SignInResult> {
  const verifier = randomVerifier();
  const challenge = await challengeFrom(verifier);
  const returnUrl = Linking.createURL('auth');

  const startUrl = `${baseUrl()}/auth/${provider}/start?challenge=${encodeURIComponent(challenge)}&returnUrl=${encodeURIComponent(returnUrl)}`;

  const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new SignInCancelled();
  }
  if (result.type !== 'success' || !result.url) {
    throw new SignInFailed(`${provider} 로그인을 마치지 못했어요.`, {
      provider,
    });
  }

  const { queryParams } = Linking.parse(result.url);
  const error = queryParams?.error;
  if (error) {
    throw new SignInFailed(`${provider} 로그인이 거절됐어요.`, {
      provider,
      raw: String(error).slice(0, 300),
    });
  }

  const ticket = queryParams?.ticket;
  if (!ticket || typeof ticket !== 'string') {
    throw new SignInFailed(`${provider} 로그인 결과를 받지 못했어요.`, {
      provider,
    });
  }

  return api<SignInResult>('/auth/exchange', {
    method: 'POST',
    anonymous: true,
    body: { ticket, codeVerifier: verifier },
  });
}

/** App Store 심사용 — 서버에서 IS_APPLE_REVIEW=true 일 때만 동작한다 */
export async function reviewSignIn(
  username: string,
  password: string,
): Promise<SignInResult> {
  return api<SignInResult>('/auth/review', {
    method: 'POST',
    anonymous: true,
    body: { username, password },
  });
}

export async function isReviewModeEnabled(): Promise<boolean> {
  try {
    const res = await api<{ enabled: boolean }>('/auth/review', {
      method: 'GET',
      anonymous: true,
    });
    return res.enabled;
  } catch {
    return false;
  }
}

/**
 * 웹(Expo Web)에서 동의 화면이 팝업으로 뜰 때, 로그인이 끝난 뒤 그 창이
 * 스스로 닫히게 한다. 네이티브에서는 아무 일도 하지 않는다 — 모듈 최상단에서
 * 한 번만 부르면 된다(Expo 문서 권장).
 */
WebBrowser.maybeCompleteAuthSession();
