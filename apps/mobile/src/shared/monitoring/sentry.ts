import * as Sentry from '@sentry/react-native';

/**
 * 오류 수집(Sentry). iOS 네이티브 쪽은 `app.json`의 `@sentry/react-native/expo` 플러그인이
 * 켜고(출시 빌드가 끝날 때 소스맵·심볼도 올린다), 여기서는 JS 쪽을 한 번 시작한다. 충돌과
 * 잡아서 보낸 오류가 대시보드에 모인다.
 *
 * DSN은 비밀이 아니라 어디로 보낼지의 주소다 — `EXPO_PUBLIC_` 값만 앱 코드에 들어온다.
 * 업로드 토큰(`SENTRY_AUTH_TOKEN`)은 빌드에만 쓰이고 앱에는 들어가지 않는다.
 *
 * **개발 중에는 켜지 않는다** — Metro 화면이 이미 오류를 보여주고, 개발 세션이 대시보드에
 * 섞이면 실제 독자의 통계를 흐린다. DSN이 없어도 켜지 않는다.
 *
 * 켜지 않는 것들(독자가 옮겨 적은 문장·내 생각이 화면의 중심인 앱이다):
 * - `sendDefaultPii` — IP·사용자 정보를 보내지 않는다.
 * - 세션 리플레이·사용자 피드백 위젯·로그 — 화면과 글이 업체로 나간다.
 * - 성능 추적(`tracesSampleRate`) — 필요해지면 그때 켠다.
 *
 * 수집이 실패해도 앱은 멈추지 않는다. 오류를 모으는 일이 오류의 원인이 되면 안 된다.
 */
export function initMonitoring(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (__DEV__ || !dsn) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    enableLogs: false,
  });
}

/**
 * 잡아서 처리한 오류도 남긴다. 화면이 '묻지 못했어요'를 띄우고 넘어가면 왜 못 물었는지가
 * 어디에도 남지 않는다 — 몇 분씩 도는 로딩의 원인을 찾을 수 없었던 이유다.
 */
export function reportError(
  error: unknown,
  where: string,
  extra?: Record<string, string | number | boolean>,
): void {
  if (__DEV__) return;
  Sentry.captureException(error, { tags: { where }, extra });
}

/** 루트 화면을 감싼다 — 렌더 중 터진 오류와 화면 흐름을 Sentry가 잡는다 */
export const wrapRoot = Sentry.wrap;
