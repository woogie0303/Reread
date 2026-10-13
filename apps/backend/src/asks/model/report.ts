import * as Sentry from '@sentry/nestjs';

/**
 * 모델이 왜 답하지 못했는지 — Sentry에 보내는 분류. 서버는 모델이 실패해도 오류가 아니라
 * `pending` 상태로 정상 응답을 주기 때문에(ADR-0003), 이 보고가 없으면 앱도 서버 오류 수집도
 * 그 일을 보지 못한다.
 */
export type ModelFailure =
  | 'timeout'
  | 'rate_limit'
  | 'auth'
  | 'bad_format'
  | 'not_configured'
  | 'http_error'
  | 'unavailable';

/**
 * **분류와 모델 이름, HTTP 상태만 보낸다.** 오류 메시지·프롬프트·문장은 싣지 않는다 —
 * 독자가 옮겨 적은 글이 업체로 나가면 안 되고, 모델이 되돌려 준 글에도 그 문장이 들어 있다.
 * 자세한 원문은 지금처럼 Render 로그에 남는다.
 *
 * 같은 분류는 하나의 이슈로 묶여 횟수로 쌓인다(`fingerprint`). 요청이 몰려 잠깐 막힌 것(429)은
 * 경고로 낮춘다.
 */
export function reportModelFailure(
  provider: 'cloudflare' | 'anthropic',
  model: string,
  kind: ModelFailure,
  status?: number,
): void {
  Sentry.captureMessage(`ask model: ${kind}`, {
    level: kind === 'rate_limit' ? 'warning' : 'error',
    tags: { provider, model, kind, ...(status ? { status } : {}) },
    fingerprint: ['ask-model', provider, kind],
  });
}
