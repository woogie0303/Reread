import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 모델에게 답을 받지 못했다는 사실 자체. 왜 못 받았는지는 로그에 남기고,
 * 부른 쪽은 이걸 잡아 '대기'로 돌린다 — 담는 일은 실패하지 않아야 한다.
 */
export class ModelUnavailable extends Error {}

export type Claude = {
  /** 키가 없으면 없다. 그래도 앱은 뜬다. */
  client?: Anthropic;
  model: string;
};

/**
 * 키가 없으면 조용히 꺼진 채로 만든다. 부팅을 막지 않는 이유는, 키가 없어도
 * 문장을 담고 서랍을 보는 일은 전부 되어야 하기 때문이다.
 */
export function claudeFor(
  config: ConfigService,
  modelKey: string,
  log: Logger,
  fallback = 'claude-haiku-4-5-20251001',
): Claude {
  const apiKey = config.get<string>('ANTHROPIC_API_KEY');
  if (!apiKey)
    log.warn(
      `ANTHROPIC_API_KEY가 없어 ${modelKey} 호출은 전부 대기로 남습니다.`,
    );

  return {
    /**
     * SDK의 기본은 한 번에 10분을 기다리고 두 번 다시 시도한다 — 모델이 멈추면 독자의
     * 화면이 몇 분씩 돌았다. 한 번에 45초, 다시 시도는 한 번까지만 두고 넘으면 '연결 실패'로
     * 기다리게 한다(담는 일은 실패하지 않는다, ADR-0003). 앱의 요청 제한(75초)보다 짧아야
     * 앱이 먼저 포기하지 않는다.
     */
    client: apiKey
      ? new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 })
      : undefined,
    model: config.get<string>(modelKey) ?? fallback,
  };
}

/** SDK가 던진 것을 갈라 로그로 남기고, 부른 쪽에는 한 가지 사실만 넘긴다. */
export function unavailable(error: unknown, log: Logger): ModelUnavailable {
  if (error instanceof ModelUnavailable) return error;

  if (error instanceof Anthropic.RateLimitError) {
    log.warn('요청이 몰려 잠시 답할 수 없습니다.');
  } else if (error instanceof Anthropic.AuthenticationError) {
    log.error('ANTHROPIC_API_KEY가 올바르지 않습니다.');
  } else if (error instanceof Anthropic.APIError) {
    log.error(`Anthropic API ${error.status}: ${error.message}`);
  } else {
    /** 제한 시간 초과(APIConnectionTimeoutError)도 여기로 온다 — 몇 분씩 도는 로딩의 단서 */
    log.error(`모델 호출에 실패했습니다: ${String(error)}`);
  }

  return new ModelUnavailable('지금은 답을 받지 못했어요.');
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** 캐시가 실제로 걸렸는지는 usage로만 알 수 있다 — 짧은 접두부는 조용히 캐시되지 않는다 */
export function logUsage(log: Logger, what: string, usage: Usage): void {
  log.debug(
    `${what}: in=${usage.input_tokens} cached=${usage.cache_read_input_tokens ?? 0} out=${usage.output_tokens}`,
  );
}

/**
 * 백만 토큰당 달러. 질문은 Haiku로만 묻는다 — 독자의 이번 달 사용량이 이 값으로
 * 매겨지므로, 모델을 바꾸거나 가격이 바뀌면 여기와 ADR-0003의 숫자를 함께 고친다.
 */
const PRICES: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  'claude-haiku-4-5-20251001': {
    input: 1,
    output: 5,
    cacheWrite: 1.25,
    cacheRead: 0.1,
  },
};

/** 한 번 부른 값(달러). 표에 없는 모델은 Haiku 값으로 매기고 로그에 남긴다. */
export function costOf(model: string, usage: Usage, log: Logger): number {
  let price = PRICES[model];
  if (!price) {
    log.warn(`${model}의 가격을 몰라 Haiku 값으로 매깁니다.`);
    price = PRICES['claude-haiku-4-5-20251001'];
  }
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead) /
    1_000_000
  );
}
