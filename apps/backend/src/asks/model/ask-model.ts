import type { Answer } from './prompt';

/**
 * 모델에게 답을 받지 못했다는 사실 자체. 왜 못 받았는지는 로그에 남기고,
 * 부른 쪽은 이걸 잡아 '대기'로 돌린다 — 담는 일은 실패하지 않아야 한다(ADR-0003).
 * 어느 공급자든 실패는 이것 하나로 넘긴다.
 */
export class ModelUnavailable extends Error {}

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

/** 한 쪽에서 고른 문장들을 묶음째 한 번 묻는다 */
export type AskInput = {
  sentences: AskedSentence[];
  bookTitle: string;
  author: string;
  page?: number;
};

export type AskResult = {
  answer: Answer;
  /** 이 호출이 쓴 실제 비용(달러). 독자의 이번 달 사용량이 이 값을 더해 센다. */
  cost: number;
};

/**
 * 질문에 답하는 모델 하나. 호출하는 쪽(`AsksService`)은 이 모양만 안다 — 어느 공급자의
 * 어떤 모델이 뒤에 있는지는 모른다. 새 모델은 이걸 구현하는 파일 하나를 더하고
 * `model.factory.ts`에 한 줄을 등록하면 갈아 끼워진다.
 *
 * 구현이 맡는 것: 호출 방법(SDK·엔드포인트)·응답 읽기·**자기 가격표로 비용 매기기**·오류를
 * `ModelUnavailable`로 바꾸기. 프롬프트와 응답 스키마는 모델과 무관한 공통이라
 * `prompt.ts`에 있다.
 */
export interface AskModel {
  /** 부를 수 있는지 — 키가 없으면 false. 그래도 앱은 뜨고 질문은 전부 대기로 남는다. */
  readonly ready: boolean;
  /** 답에 적어 두는 모델 이름(`Ask.answeredBy`) */
  readonly modelName: string;
  answer(input: AskInput): Promise<AskResult>;
}

/** Nest 주입 토큰 */
export const ASK_MODEL = Symbol('ASK_MODEL');
