import type { Book } from '@/entities/book/model/types';

/**
 * 문장 안에서 밑줄이 그어지는 자리 하나 — 곧 어휘 항목이다.
 *
 * `surface`는 표현이 **그 문장에서 실제로 나타난 형태**다(`made out`). 표제형
 * (`make out`)으로는 문장에서 찾을 수 없어서 밑줄을 그을 수 없다. 이 값은
 * 물어볼 때 모델이 함께 준다 — 사전이 없으므로(ADR-0002) 나중에 다시 만들어낼
 * 방법이 없고, 그래서 물어본 적 없는 문장에는 밑줄이 없다.
 */
export type SentenceMark = {
  /** 문장에 나타난 그대로 */
  surface: string;
  /** 표제형 — 항목의 이름 */
  term: string;
  meaning: string;
  /** 서랍에 담긴 항목이면 있다. 누르면 그 항목이 만난 모든 문장으로 간다. */
  itemId?: string;
  /** 몇 번 만났는지. 2 이상이면 재회다. */
  met?: number;
};

/**
 * 서랍의 한 줄. 문장이 주인이고 표현은 그 안의 밑줄이다(ADR-0004).
 *
 * 한국어(`translation`·`meaning`)를 들고 있지만 **처음부터 보여주지 않는다** —
 * 영어 옆에 한국어가 놓이는 순간 눈은 한국어를 읽고, 그게 이 앱이 거부하는
 * 단어장이다. 드러내는 일은 `SentenceCard`가 청을 받고 한다.
 */
export type SentenceCardData = {
  /** 문장 id */
  id: string;
  text: string;
  page?: number;
  /** 카드의 표지 썸네일(없으면 책등 색)이 여기서 온다 */
  book?: Book;
  /** 물어본 적이 있는지 — 없으면 밑줄도 번역도 없고, 대신 물어볼 수 있다 */
  asked: boolean;
  /** 물어봤지만 아직 답이 없다(할당량 소진·연결 실패) */
  pending?: boolean;
  translation?: string;
  /** 번역에서 담은 표현에 해당하는 글자들 — 번역에 담은 표현과 같은 밑줄이 선다 */
  translationSpans?: string[];
  marks: SentenceMark[];
  /**
   * 이 문장에서 표현을 하나라도 담았는지. `marks`와 다르다 — 밑줄은 `surface`가
   * 있는 만남에서만 그어지지만, 담았는지는 만남이 있는지로 센다.
   */
  claimed: boolean;
  /** 하트를 켰는지 — 켜면 표현이 있어도 '마음에 들었던 문장'에 선다 */
  favorite?: boolean;
  /** 언제 담았는지 — 이미 사람이 읽을 말로 옮겨진 것 */
  savedLabel?: string;
  /** 정렬용 원본 시각. 두 원천을 시간 하나로 합칠 때 쓴다. */
  savedAt: string;
};
