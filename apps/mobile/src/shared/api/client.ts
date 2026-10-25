import Constants from 'expo-constants';
import { clearTokens, readTokens, saveTokens } from './tokens';
import type { Tokens } from './types';

/**
 * EXPO_PUBLIC_API_URL을 우선 쓴다. 없으면 Expo가 알려주는 개발 서버
 * 주소(hostUri)에서 호스트만 떼어 맥의 LAN IP로 추측하는데, 이건 Metro가
 * LAN 모드로 떴을 때만 맞는다 — 터널 모드면 hostUri가 Metro 자체의 터널
 * 주소로 잡히고, 그 주소엔 4000번(이 백엔드)이 없어서 연결이 조용히 실패한다.
 * 그래서 .env.example이 이 값을 비워두지 말고 채우라고 권한다.
 */
/** 카카오·네이버·구글 로그인이 브라우저로 열 첫 주소를 짓는 데도 쓴다(oauth.ts) */
export function baseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:4000/api` : 'http://localhost:4000/api';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 서버에 닿지 못했거나 답이 너무 늦다. 브라우저·RN의 `fetch`는 이럴 때 영어 메시지
 * ('Network request failed')를 던져서 그대로 보여주면 무슨 뜻인지 알 수 없다.
 * `late`면 요청은 서버에 갔을 수 있다 — 서버는 하던 일을 마저 하고, 앱만 기다리기를
 * 그만둔 것이다. 문장을 담는 일은 그 전에 끝나 있다.
 */
export class NetworkError extends ApiError {
  constructor(
    message: string,
    readonly late: boolean,
  ) {
    super(0, message);
  }
}

/** 로그인이 끊겼다는 신호. 세션이 이걸 받아 로그인 화면으로 되돌린다. */
export class Unauthenticated extends ApiError {
  constructor() {
    super(401, '다시 로그인해 주세요.');
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 로그인 전에 부르는 길 — 토큰을 붙이지 않는다 */
  anonymous?: boolean;
  /**
   * 토큰이 있으면 붙이고, 없어도 부르는 길 — 로그인하는 길이다. 익명으로 쓰던 독자가
   * 로그인하면 그 토큰을 보고 서버가 익명 기록을 옮긴다. 401이 와도 '다시 로그인해
   * 주세요'로 바꾸지 않는다 — 로그인 중에 나는 401은 서버가 준 이유가 맞는 말이다.
   */
  optionalAuth?: boolean;
  /**
   * 이만큼 기다려도 답이 없으면 그만 기다린다(밀리초). 정하지 않으면 끝없이 기다리는데,
   * 모델을 부르는 길에서는 그것이 몇 분씩 도는 로딩 화면이 된다.
   */
  timeoutMs?: number;
};

let refreshing: Promise<string | null> | null = null;

/**
 * 액세스 토큰이 만료되면 한 번만 새로 받아 같은 요청을 다시 보낸다.
 *
 * 새로 받는 일은 한 번에 하나만 돈다. 화면 넷이 동시에 401을 받으면 재발급도
 * 네 번 도는데, 리프레시는 쓰면 폐기되는 일회용이라 나머지 셋이 이미 죽은
 * 토큰으로 요청하게 되고 그 순간 로그아웃된다.
 */
async function refresh(): Promise<string | null> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const stored = await readTokens();
    if (!stored) return null;

    const response = await fetch(`${baseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored.refresh }),
    });

    if (!response.ok) {
      await clearTokens();
      return null;
    }

    const tokens = (await response.json()) as Tokens;
    await saveTokens(tokens);
    return tokens.accessToken;
  })().finally(() => {
    refreshing = null;
  });

  return refreshing;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const send = async (token?: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined)
      headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = options.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

    try {
      return await fetch(`${baseUrl()}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new NetworkError('답이 너무 늦어지고 있어요.', true);
      }
      throw new NetworkError(
        '서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.',
        false,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const stored = options.anonymous ? null : await readTokens();
  let response = await send(stored?.access);

  if (options.optionalAuth) {
    /**
     * 익명 토큰이 만료돼 막혔으면 새로 받아 다시 보낸다 — 그냥 토큰 없이 보내면 익명
     * 기록이 옮겨지지 않는다. 새로 받지 못하면(리프레시도 죽음) 토큰 없이라도 로그인은 한다.
     */
    if (response.status === 401 && stored) {
      response = await send(await refresh());
    }
  } else if (response.status === 401 && !options.anonymous) {
    const renewed = await refresh();
    if (!renewed) throw new Unauthenticated();
    response = await send(renewed);
    if (response.status === 401) throw new Unauthenticated();
  } else if (response.status === 401) {
    throw new Unauthenticated();
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** 서버는 실패할 때도 사람에게 보여줄 한국어 문장을 준다 — 그걸 그대로 쓴다 */
async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('\n');
    if (body.message) return body.message;
  } catch {
    /* 본문이 JSON이 아닐 수도 있다 */
  }
  return '잠시 후 다시 시도해 주세요.';
}
