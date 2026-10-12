import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelUnavailable, type AskInput } from './ask-model';
import {
  CLOUDFLARE_DEFAULT_MODEL,
  CloudflareModel,
  costOf,
  parseAnswer,
} from './cloudflare.model';

const input: AskInput = {
  bookTitle: 'Call Me by Your Name',
  author: 'André Aciman',
  page: 18,
  sentences: [{ text: 'She brushed it off.', picks: ['brushed it off'] }],
};

const answer = {
  sentences: [
    {
      translation: '그녀는 대수롭지 않게 넘겼다.',
      picks: [
        {
          surface: 'brushed it off',
          term: 'brush it off',
          meaning: '대수롭지 않게 넘기다',
        },
      ],
    },
  ],
};

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const creds = { CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'token' };

/** 응답을 차례로 돌려주는 가짜 fetch */
function fakeFetch(...replies: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = jest.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: typeof url === 'string' ? url : '', init: init ?? {} });
    const next = replies.shift();
    if (!next) throw new Error('예상보다 많이 불렀다');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const ok = (content: unknown, usage?: object) =>
  new Response(
    JSON.stringify({
      success: true,
      result: {
        choices: [{ message: { content }, finish_reason: 'stop' }],
        usage,
      },
    }),
    { status: 200 },
  );

describe('CloudflareModel', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('키가 없으면 준비되지 않고, 부르면 ModelUnavailable이다', async () => {
    const { fn } = fakeFetch();
    const model = new CloudflareModel(config({}), fn);
    expect(model.ready).toBe(false);
    await expect(model.answer(input)).rejects.toBeInstanceOf(ModelUnavailable);
    expect(fn).not.toHaveBeenCalled();
  });

  it('기본 모델은 Gemma이고 생각 모드를 끄고 JSON 모드로 묻는다', async () => {
    const { fn, calls } = fakeFetch(ok(JSON.stringify(answer)));
    const model = new CloudflareModel(config(creds), fn);
    expect(model.modelName).toBe(CLOUDFLARE_DEFAULT_MODEL);

    await model.answer(input);

    expect(calls[0].url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/acct/ai/run/${CLOUDFLARE_DEFAULT_MODEL}`,
    );
    const body = JSON.parse(calls[0].init.body as string) as Record<
      string,
      unknown
    >;
    expect(body.response_format).toMatchObject({ type: 'json_schema' });
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token');
  });

  it('답과 사용량으로 매긴 비용을 돌려준다', async () => {
    const { fn } = fakeFetch(
      ok(JSON.stringify(answer), {
        prompt_tokens: 875,
        completion_tokens: 212,
      }),
    );
    const model = new CloudflareModel(config(creds), fn);

    const result = await model.answer(input);

    expect(result.answer).toEqual(answer);
    /** 875×$0.10 + 212×$0.30 (백만 토큰당) — Haiku의 1/65 */
    expect(result.cost).toBeCloseTo(0.00015, 5);
  });

  it('```json 울타리를 두른 답도 읽는다', async () => {
    const { fn } = fakeFetch(
      ok('```json\n' + JSON.stringify(answer) + '\n```', {
        prompt_tokens: 1,
        completion_tokens: 1,
      }),
    );
    const model = new CloudflareModel(config(creds), fn);
    await expect(model.answer(input)).resolves.toMatchObject({ answer });
  });

  it('형식이 어긋난 답은 한 번 다시 묻는다', async () => {
    const { fn } = fakeFetch(
      ok('이건 JSON이 아니에요'),
      ok(JSON.stringify(answer), { prompt_tokens: 1, completion_tokens: 1 }),
    );
    const model = new CloudflareModel(config(creds), fn);

    await expect(model.answer(input)).resolves.toMatchObject({ answer });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('다시 물어도 어긋나면 ModelUnavailable이다', async () => {
    const { fn } = fakeFetch(ok('{"sentences": 3}'), ok('{"sentences": 3}'));
    const model = new CloudflareModel(config(creds), fn);

    await expect(model.answer(input)).rejects.toBeInstanceOf(ModelUnavailable);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('답이 길이 제한에서 잘렸으면 형식이 어긋난 것으로 본다', async () => {
    const cut = new Response(
      JSON.stringify({
        result: {
          choices: [
            {
              message: { content: '{"sentences": [' },
              finish_reason: 'length',
            },
          ],
        },
      }),
    );
    const { fn } = fakeFetch(cut, ok(JSON.stringify(answer)));
    const model = new CloudflareModel(config(creds), fn);
    await expect(model.answer(input)).resolves.toMatchObject({ answer });
  });

  it('서버 오류·429·네트워크 오류는 다시 묻지 않고 ModelUnavailable이다', async () => {
    for (const reply of [
      new Response('{"errors":[{"message":"boom"}]}', { status: 500 }),
      new Response('{}', { status: 429 }),
      new Response('{}', { status: 401 }),
      new Error('ECONNRESET'),
    ]) {
      const { fn } = fakeFetch(reply);
      const model = new CloudflareModel(config(creds), fn);
      await expect(model.answer(input)).rejects.toBeInstanceOf(
        ModelUnavailable,
      );
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });
});

describe('parseAnswer', () => {
  it('객체로 온 답도 스키마로 검증한다', () => {
    expect(parseAnswer(answer)).toEqual(answer);
    expect(() => parseAnswer({ sentences: [{ translation: 1 }] })).toThrow();
  });
});

describe('costOf (Cloudflare)', () => {
  const warn = jest.fn();
  const log = { warn } as unknown as Logger;
  beforeEach(() => warn.mockClear());

  it('사용량이 없으면 글자 수로 어림하고 로그에 남긴다', () => {
    const cost = costOf(CLOUDFLARE_DEFAULT_MODEL, undefined, 2000, log);
    expect(cost).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
  });

  it('표에 없는 모델은 비싼 어림 값으로 매기고 로그에 남긴다', () => {
    const known = costOf(
      CLOUDFLARE_DEFAULT_MODEL,
      { prompt_tokens: 1000, completion_tokens: 1000 },
      0,
      log,
    );
    const unknown = costOf(
      '@cf/unknown/model',
      { prompt_tokens: 1000, completion_tokens: 1000 },
      0,
      log,
    );
    expect(unknown).toBeGreaterThan(known);
    expect(warn).toHaveBeenCalled();
  });
});
