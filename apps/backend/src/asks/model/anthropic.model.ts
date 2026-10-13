import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ModelUnavailable,
  type AskInput,
  type AskModel,
  type AskResult,
} from './ask-model';
import { AnswerFormat, SYSTEM, userPrompt } from './prompt';
import { reportModelFailure, type ModelFailure } from './report';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/**
 * 백만 토큰당 달러. 모델을 바꾸거나 가격이 바뀌면 여기와 ADR-0003의 숫자를 함께 고친다.
 * 독자의 이번 달 사용량이 이 값으로 매겨진다.
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
    price = PRICES[ANTHROPIC_DEFAULT_MODEL];
  }
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead) /
    1_000_000
  );
}

/** 캐시가 실제로 걸렸는지는 usage로만 알 수 있다 — 짧은 접두부는 조용히 캐시되지 않는다 */
function logUsage(log: Logger, what: string, usage: Usage): void {
  log.debug(
    `${what}: in=${usage.input_tokens} cached=${usage.cache_read_input_tokens ?? 0} out=${usage.output_tokens}`,
  );
}

function statusOf(error: unknown): number | undefined {
  if (!(error instanceof Anthropic.APIError)) return undefined;
  const status: unknown = error.status;
  return typeof status === 'number' && status ? status : undefined;
}

/** SDK가 던진 것을 Sentry에 보낼 분류로 옮긴다 */
function failureOf(error: unknown): ModelFailure {
  if (error instanceof Anthropic.RateLimitError) return 'rate_limit';
  if (error instanceof Anthropic.AuthenticationError) return 'auth';
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof Anthropic.APIError) return 'http_error';
  return 'unavailable';
}

/** SDK가 던진 것을 갈라 로그로 남기고, 부른 쪽에는 한 가지 사실만 넘긴다. */
function unavailable(
  error: unknown,
  log: Logger,
  model: string,
): ModelUnavailable {
  if (error instanceof ModelUnavailable) return error;

  reportModelFailure('anthropic', model, failureOf(error), statusOf(error));

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

/**
 * Anthropic(Claude)으로 묻는다. 구조화 출력을 SDK가 강제해서 파싱이 실패할 일이 없고,
 * 붙박이 시스템 프롬프트는 캐시에 올린다.
 */
export class AnthropicModel implements AskModel {
  private readonly log = new Logger(AnthropicModel.name);
  private readonly client?: Anthropic;
  readonly modelName: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey)
      this.log.warn('ANTHROPIC_API_KEY가 없어 질문은 전부 대기로 남습니다.');

    /**
     * SDK의 기본은 한 번에 10분을 기다리고 두 번 다시 시도한다 — 모델이 멈추면 독자의
     * 화면이 몇 분씩 돌았다. 한 번에 45초, 다시 시도는 한 번까지만 두고 넘으면 '연결 실패'로
     * 기다리게 한다(담는 일은 실패하지 않는다, ADR-0003). 앱의 요청 제한(75초)보다 짧아야
     * 앱이 먼저 포기하지 않는다.
     */
    this.client = apiKey
      ? new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 })
      : undefined;
    /** 공급자를 바꾸고 `ASK_MODEL`을 안 지웠을 때(`@cf/…`가 남은 경우)를 위해 알아보는 이름만 쓴다 */
    const asked = config.get<string>('ASK_MODEL');
    if (asked && !asked.startsWith('claude-'))
      this.log.warn(
        `ASK_MODEL=${asked}는 Claude 모델 이름이 아니라 무시하고 ${ANTHROPIC_DEFAULT_MODEL}을 씁니다.`,
      );
    this.modelName = asked?.startsWith('claude-')
      ? asked
      : ANTHROPIC_DEFAULT_MODEL;
  }

  get ready(): boolean {
    return Boolean(this.client);
  }

  async answer(input: AskInput): Promise<AskResult> {
    if (!this.client) {
      reportModelFailure('anthropic', this.modelName, 'not_configured');
      throw new ModelUnavailable('AI가 설정되지 않았습니다.');
    }

    try {
      const response = await this.client.messages.parse({
        model: this.modelName,
        /** 다섯 문장에 표현 여덟 개씩이어도 3천 토큰 안쪽이다. 크게 잡을수록 오래 걸린다. */
        max_tokens: 6000,
        /** 붙박이 부분만 캐시에 올린다 */
        system: [
          { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: userPrompt(input) }],
        output_config: { format: zodOutputFormat(AnswerFormat) },
      });

      logUsage(this.log, 'ask', response.usage);

      if (response.stop_reason === 'refusal') {
        throw new ModelUnavailable(
          `모델이 답을 거절했습니다: ${response.stop_details?.category ?? '이유 없음'}`,
        );
      }

      const parsed = response.parsed_output;
      if (!parsed) throw new ModelUnavailable('모델의 답을 읽지 못했습니다.');

      return {
        answer: parsed,
        cost: costOf(this.modelName, response.usage, this.log),
      };
    } catch (error) {
      throw unavailable(error, this.log, this.modelName);
    }
  }
}
