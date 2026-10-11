import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  claudeFor,
  costOf,
  logUsage,
  ModelUnavailable,
  unavailable,
  type Claude,
} from '../../common/claude';

/**
 * 모델이 돌려줘야 하는 모양. 구조화 출력(structured outputs)으로 강제하므로
 * 답을 파싱하다 실패할 일이 없다 — 대신 스키마가 곧 명세라, 여기 적힌 설명이
 * 프롬프트만큼 중요하다.
 */
const AnswerFormat = z.object({
  sentences: z
    .array(
      z.object({
        translation: z
          .string()
          .describe(
            '문장이 외국어면 문장 전체의 자연스러운 한국어 번역(직역체로 쓰지 않는다). ' +
              '문장이 한국어면 같은 뜻을 쉬운 한국어로 풀어 쓴 문장. ' +
              '"번역 생략"이라고 표시된 문장은 빈 문자열로 둔다.',
          ),
        picks: z
          .array(
            z.object({
              surface: z
                .string()
                .describe(
                  '독자가 고른 표현을 받은 그대로 되돌려 적는다. 고치거나 늘리지 않는다.',
                ),
              term: z
                .string()
                .describe(
                  '표제형(canonical form). 문장에 있던 활용형이 아니라 사전에 실릴 꼴로 적는다. ' +
                    '예: 고른 것이 "brushed it off"였다면 "brush it off".',
                ),
              meaning: z
                .string()
                .describe(
                  '이 문장에서의 뜻 하나를 한국어 한 줄로. 사전 뜻을 나열하지 않는다.',
                ),
            }),
          )
          .describe('독자가 이 문장에서 고른 표현마다 하나씩, 받은 순서대로.'),
      }),
    )
    .describe('받은 문장마다 하나씩, 받은 순서대로.'),
});

export type Answer = z.infer<typeof AnswerFormat>;

/**
 * 물을 문장 하나 — 글과, 독자가 그 안에서 고른 표현들. 이미 번역을 받은 문장이면
 * `knownTranslation`이 있고, 그때는 번역을 다시 시키지 않는다 — 다시 물을 때마다
 * 문장 뜻이 달라지는 것을 막는다.
 */
export type AskedSentence = {
  text: string;
  picks: string[];
  knownTranslation?: string;
};

/**
 * 프롬프트의 붙박이 부분. 요청마다 달라지는 것(책·문장)은 여기 넣지 않는다 —
 * 캐시는 앞에서부터 한 글자만 달라도 깨지기 때문이다(ADR-0001의 '안정적인 접두부').
 *
 * 다만 캐시에는 최소 길이가 있고 모델마다 다르다(Sonnet 5는 1024토큰, Opus 5는 512).
 * 이 프롬프트가 그보다 짧으면 cache_control을 걸어도 **조용히** 캐시되지 않는다 —
 * 오류가 나지 않으므로 usage.cache_read_input_tokens로만 확인할 수 있다.
 */
const SYSTEM = `당신은 책을 읽는 한국어 사용자를 돕습니다. 책은 영어·일본어 같은
외국어 책일 수도 있고, 한국어 책일 수도 있습니다. 문장이 어느 언어인지는 문장을 보고
판단합니다.

책의 한 쪽에서 옮겨 적은 문장을 하나에서 다섯 개까지 받습니다. 문장마다 독자가
**모르겠다고 직접 고른 표현**이 함께 옵니다. 단어 하나일 수도 있고, 여러 단어가
붙은 덩어리일 수도 있습니다. 하는 일은 둘입니다.

1) 문장마다 뜻을 한국어로 씁니다.
   - 외국어 문장이면 자연스러운 한국어로 옮깁니다. 학교 번역투가 아니라, 한국어로
     읽었을 때 그 장면이 그려지는 문장으로 씁니다.
   - 한국어 문장이면 옮길 필요가 없으니, 같은 뜻을 **쉬운 말로 풀어 씁니다.**
     원문을 거의 그대로 되풀이하지 않습니다.
   - 문장 앞에 "번역 생략"이라고 적혀 있으면 이미 번역이 있는 문장입니다.
     translation은 빈 문자열로 두고, 고른 표현만 풀어 줍니다.

2) 독자가 고른 표현마다 사전에 실릴 꼴과 그 문장에서의 뜻을 씁니다.
   - surface에는 받은 표현을 **글자 하나 바꾸지 않고** 그대로 되돌려 적습니다.
     서버가 이 값으로 독자가 고른 것과 답을 짝짓습니다.
   - term은 사전에 실릴 꼴입니다. 문장에 적힌 활용형이 아니라 원형으로 적습니다 —
     "brushed it off"는 "brush it off", "was taken aback"은 "be taken aback",
     "ran"은 "run". 같은 표현을 다른 문장에서 다른 꼴로 만나도 같은 term이 되어야
     합니다. 이 값이 같아야 독자가 예전에 헷갈렸던 그 표현과 다시 이어집니다.
   - 독자가 덩어리의 일부만 골랐더라도(예: "make out" 중 "out"만) 독자가 고른 범위를
     존중합니다. 다만 그 단어가 문장에서 덩어리로만 뜻을 가지면, 뜻풀이에서 그 덩어리
     안에서의 뜻을 씁니다.

지킬 것:

- 문장도 표현도 받은 순서 그대로, 받은 개수 그대로 돌려줍니다. 빼거나 더하지 않습니다.
- 독자가 고르지 않은 표현을 골라 주지 않습니다. 무엇을 모르는지는 독자가 압니다.
- 뜻은 **그 문장에서의 뜻 하나**만, 한국어 한 줄로 씁니다. 같은 표현도 문장이 다르면
  뜻이 다릅니다. make out은 어떤 문장에서는 '겨우 알아보다'이고 다른 문장에서는
  그렇지 않습니다. 사전 뜻을 여러 개 나열하지 않습니다.
- 설명은 처음 보는 사람도 읽히게 쉽게 씁니다. 뉘앙스는 그것이 뜻을 가를 때만
  덧붙입니다.
- 사진에서 읽어낸 글이라 글자가 조금 틀리거나 줄 끝 하이픈이 남아 있을 수 있습니다.
  뜻은 바로잡은 글을 기준으로 쓰되, surface는 받은 그대로 둡니다.`;

/**
 * 한 쪽에서 고른 문장들을 묻는 한 번의 호출. 문장마다 부르지 않는다 — 묶음째
 * 한 번에 물어야 같은 맥락(같은 책·같은 쪽)을 한 번만 싣고, 독자도 한 번 기다린다.
 *
 * 파서도 사전도 두지 않는다. 문장을 설명하는 모델이 이미 문장을 외울 만한
 * 덩어리로 나누기 때문에, 같은 일을 하는 두 번째 조각을 두면 서로 다른 답을
 * 낼 뿐이다(ADR-0002).
 */
@Injectable()
export class AnswerService {
  private readonly log = new Logger(AnswerService.name);
  private readonly claude: Claude;

  constructor(config: ConfigService) {
    this.claude = claudeFor(config, 'ASK_MODEL', this.log);
  }

  get ready(): boolean {
    return Boolean(this.claude.client);
  }

  get modelName(): string {
    return this.claude.model;
  }

  async answer(input: {
    sentences: AskedSentence[];
    bookTitle: string;
    author: string;
    page?: number;
  }): Promise<{ answer: Answer; cost: number }> {
    const { client, model } = this.claude;
    if (!client) throw new ModelUnavailable('AI가 설정되지 않았습니다.');

    try {
      const response = await client.messages.parse({
        model,
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
        cost: costOf(model, response.usage, this.log),
      };
    } catch (error) {
      throw unavailable(error, this.log);
    }
  }
}

/** 요청마다 달라지는 것들 — 캐시가 깨지지 않게 시스템이 아니라 여기 싣는다 */
function userPrompt(input: {
  sentences: AskedSentence[];
  bookTitle: string;
  author: string;
  page?: number;
}): string {
  const where = input.page
    ? `${input.bookTitle} p.${input.page}`
    : input.bookTitle;
  const blocks = input.sentences.map((sentence, i) =>
    [
      sentence.knownTranslation
        ? `[문장 ${i + 1}] (번역 생략)`
        : `[문장 ${i + 1}]`,
      sentence.text,
      '고른 표현:',
      ...sentence.picks.map((pick) => `- ${pick}`),
    ].join('\n'),
  );
  return [`출처: ${where} (${input.author})`, '', ...blocks].join('\n\n');
}
