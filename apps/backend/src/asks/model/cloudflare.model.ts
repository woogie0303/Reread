import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  ModelUnavailable,
  type AskInput,
  type AskModel,
  type AskResult,
} from './ask-model';
import { AnswerFormat, SYSTEM, userPrompt, type Answer } from './prompt';
import { reportModelFailure, type ModelFailure } from './report';

export const CLOUDFLARE_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

type Price = {
  /** 백만 토큰당 달러 */
  input: number;
  output: number;
  /**
   * 추론(생각) 모드를 끄는 요청 필드가 있는 모델. 끄지 않으면 보이지 않는 생각 토큰이 출력으로
   * 과금되고 답이 17~38초 걸린다(Gemma 4 26B 실측: 끄면 2~7초, 출력 약 210토큰).
   */
  noThinking?: Record<string, unknown>;
};

/**
 * 모델마다 가격과 필요한 옵션이 다르다. 표에 없는 모델은 부를 수는 있지만 비용을 어림으로만
 * 매긴다 — 새 모델을 쓰기 전에 여기에 가격을 적는다(Cloudflare Workers AI 가격 페이지).
 */
const PRICES: Record<string, Price> = {
  '@cf/google/gemma-4-26b-a4b-it': {
    input: 0.1,
    output: 0.3,
    noThinking: { chat_template_kwargs: { enable_thinking: false } },
  },
  '@cf/openai/gpt-oss-120b': { input: 0.35, output: 0.75 },
  '@cf/qwen/qwen3-30b-a3b-fp8': { input: 0.051, output: 0.335 },
};

/** 표에 없는 모델의 어림 가격 — 표의 가장 비싼 값보다 높게 잡아 한도가 느슨해지지 않게 한다 */
const UNKNOWN_PRICE: Price = { input: 0.5, output: 1.5 };

type Usage = { prompt_tokens?: number; completion_tokens?: number };

/** 한 번 부른 값(달러). 사용량이 없으면 글자 수로 어림하고 로그에 남긴다. */
export function costOf(
  model: string,
  usage: Usage | undefined,
  fallbackChars: number,
  log: Logger,
): number {
  let price = PRICES[model];
  if (!price) {
    log.warn(`${model}의 가격을 몰라 어림 값으로 매깁니다.`);
    price = UNKNOWN_PRICE;
  }
  let input = usage?.prompt_tokens;
  let output = usage?.completion_tokens;
  if (input === undefined || output === undefined) {
    log.warn('응답에 토큰 사용량이 없어 글자 수로 어림합니다.');
    input = Math.ceil(fallbackChars / 2);
    output = 500;
  }
  return (input * price.input + output * price.output) / 1_000_000;
}

/** ```json 울타리를 두르는 모델이 있다 */
function stripFence(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim();
}

/**
 * 응답에서 답을 꺼내 우리 스키마로 검증한다. **형식을 모델이 강제하지 않으므로** 여기서
 * 못 읽으면 실패다 — 부른 쪽이 한 번 다시 묻는다.
 */
export function parseAnswer(content: unknown): Answer {
  const value: unknown =
    typeof content === 'string' ? JSON.parse(stripFence(content)) : content;
  return AnswerFormat.parse(value);
}

type Reply = {
  result?: {
    choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    usage?: Usage;
  };
  success?: boolean;
  errors?: { code?: number; message?: string }[];
};

/**
 * Cloudflare Workers AI(Gemma 등)로 묻는다. REST로 부르고, JSON 모드(`json_schema`)로
 * 형식을 부탁한 뒤 받은 답을 우리 스키마로 직접 검증한다.
 *
 * 응답은 OpenAI식이다: 텍스트는 `result.choices[0].message.content`, 사용량은
 * `result.usage.prompt_tokens`·`completion_tokens`. 프롬프트 캐시는 없다.
 */
export class CloudflareModel implements AskModel {
  private readonly log = new Logger(CloudflareModel.name);
  private readonly account?: string;
  private readonly token?: string;
  readonly modelName: string;

  constructor(
    config: ConfigService,
    /** 시험에서 갈아 끼운다 */
    private readonly fetchImpl: typeof fetch = fetch,
    /** 한 번의 요청이 기다리는 시간. 앱의 요청 제한(75초)보다 짧아야 앱이 먼저 포기하지 않는다. */
    private readonly timeoutMs = 45_000,
  ) {
    this.account = config.get<string>('CLOUDFLARE_ACCOUNT_ID');
    this.token = config.get<string>('CLOUDFLARE_API_TOKEN');
    if (!this.account || !this.token)
      this.log.warn(
        'CLOUDFLARE_ACCOUNT_ID·CLOUDFLARE_API_TOKEN이 없어 질문은 전부 대기로 남습니다.',
      );
    /**
     * Workers AI 모델 이름은 `@cf/`로 시작한다. 공급자를 바꾸고 `ASK_MODEL`을 안 지웠을 때
     * (예전 `claude-…`가 남은 경우) 엉뚱한 이름을 Cloudflare에 보내 모든 질문이 대기로 남지 않게,
     * 알아보지 못하는 이름은 무시하고 기본 모델로 돌아간다.
     */
    const asked = config.get<string>('ASK_MODEL');
    if (asked && !asked.startsWith('@cf/'))
      this.log.warn(
        `ASK_MODEL=${asked}는 Workers AI 모델 이름이 아니라 무시하고 ${CLOUDFLARE_DEFAULT_MODEL}을 씁니다.`,
      );
    this.modelName = asked?.startsWith('@cf/')
      ? asked
      : CLOUDFLARE_DEFAULT_MODEL;
  }

  get ready(): boolean {
    return Boolean(this.account && this.token);
  }

  async answer(input: AskInput): Promise<AskResult> {
    if (!this.ready) {
      reportModelFailure('cloudflare', this.modelName, 'not_configured');
      throw new ModelUnavailable('AI가 설정되지 않았습니다.');
    }

    const started = Date.now();
    try {
      return await this.ask(input);
    } catch (error) {
      /**
       * 형식이 어긋난 답(JSON이 아니거나 스키마에 안 맞음)은 한 번 다시 묻는다 — 모델이 형식을
       * 강제하지 않아서 가끔 벌어지는 일이다. 첫 시도가 오래 걸렸으면 다시 묻지 않는다: 앱이
       * 먼저 포기하기 전에 '대기'로 돌려야 한다.
       */
      if (isShapeError(error) && Date.now() - started < 15_000) {
        this.log.warn(`답의 형식이 어긋나 다시 묻습니다: ${describe(error)}`);
        try {
          return await this.ask(input);
        } catch (again) {
          throw this.unavailable(again);
        }
      }
      throw this.unavailable(error);
    }
  }

  private async ask(input: AskInput): Promise<AskResult> {
    const system = SYSTEM;
    const user = userPrompt(input);

    const response = await this.fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${this.account}/ai/run/${this.modelName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'answer',
              schema: z.toJSONSchema(AnswerFormat),
            },
          },
          /** 다섯 문장에 표현 여덟 개씩이어도 3천 토큰 안쪽이다 */
          max_tokens: 4000,
          ...PRICES[this.modelName]?.noThinking,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );

    if (!response.ok) throw await httpError(response);

    const body = (await response.json()) as Reply;
    const choice = body.result?.choices?.[0];
    if (!choice) throw new ShapeError('응답에 choices가 없습니다.');
    if (choice.finish_reason === 'length')
      throw new ShapeError('답이 길이 제한에서 잘렸습니다.');

    const answer = parseAnswer(choice.message?.content);
    this.log.debug(
      `ask: in=${body.result?.usage?.prompt_tokens} out=${body.result?.usage?.completion_tokens}`,
    );
    return {
      answer,
      cost: costOf(
        this.modelName,
        body.result?.usage,
        system.length + user.length,
        this.log,
      ),
    };
  }

  /** 던져진 것을 갈라 로그로 남기고, 부른 쪽에는 한 가지 사실만 넘긴다. 토큰은 남기지 않는다. */
  private unavailable(error: unknown): ModelUnavailable {
    if (error instanceof ModelUnavailable) return error;
    reportModelFailure(
      'cloudflare',
      this.modelName,
      failureOf(error),
      error instanceof HttpError ? error.status : undefined,
    );
    if (error instanceof HttpError) {
      if (error.status === 429)
        this.log.warn('요청이 몰려 잠시 답할 수 없습니다.');
      else if (error.status === 401 || error.status === 403)
        this.log.error(
          'CLOUDFLARE_API_TOKEN이 올바르지 않거나 권한이 없습니다.',
        );
      else this.log.error(`Cloudflare API ${error.status}: ${error.message}`);
    } else {
      /** 제한 시간 초과(TimeoutError)도 여기로 온다 */
      this.log.error(`모델 호출에 실패했습니다: ${describe(error)}`);
    }
    return new ModelUnavailable('지금은 답을 받지 못했어요.');
  }
}

class ShapeError extends Error {}
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function httpError(response: Response): Promise<HttpError> {
  let message = response.statusText;
  try {
    const body = (await response.json()) as Reply;
    message = body.errors?.map((e) => e.message).join('; ') || message;
  } catch {
    /* 본문이 JSON이 아니면 상태 문구만 쓴다 */
  }
  return new HttpError(response.status, message);
}

/** JSON이 아니거나 스키마에 안 맞는 답 — 다시 물어볼 만한 실패 */
/** 던져진 것을 Sentry에 보낼 분류로 옮긴다 */
function failureOf(error: unknown): ModelFailure {
  if (error instanceof HttpError) {
    if (error.status === 429) return 'rate_limit';
    if (error.status === 401 || error.status === 403) return 'auth';
    return 'http_error';
  }
  if (isShapeError(error)) return 'bad_format';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  return 'unavailable';
}

function isShapeError(error: unknown): boolean {
  return (
    error instanceof ShapeError ||
    error instanceof SyntaxError ||
    error instanceof z.ZodError
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : String(error);
}
