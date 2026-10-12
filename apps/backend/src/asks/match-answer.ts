import type { AskedSentence } from './model/ask-model';
import type { Answer } from './model/prompt';

/** 문장 하나의 답 — 고른 표현마다 사전 꼴과 뜻이 짝지어졌다 */
export type MatchedAnswer = {
  translation: string;
  picks: { surface: string; term: string; meaning: string }[];
};

const loose = (text: string) => text.trim().toLowerCase();

/**
 * 모델의 답을 물은 문장·고른 표현과 짝짓는다. 문장은 순서로, 표현은 되돌려 적은
 * `surface`로 맞추고, 그래도 못 찾으면 순서로 맞춘다(개수가 같을 때만).
 *
 * **하나라도 못 맞추면 그 문장은 `null`이다** — 답을 받지 못한 것으로 친다. 고른
 * 표현 중 하나가 빠진 채 담기면 독자는 그 표현을 다시 고를 길이 없다. 대신 그
 * 문장의 질문은 '연결 실패'로 기다리고, 다시 물으면 처음부터 다시 받는다.
 */
export function matchAnswer(
  asked: AskedSentence[],
  answer: Answer,
): (MatchedAnswer | null)[] {
  return asked.map((sentence, i) => {
    const got = answer.sentences[i];
    /** 이미 번역이 있는 문장은 모델이 번역을 비워 와도 그 번역을 그대로 쓴다 */
    const translation =
      sentence.knownTranslation ?? got?.translation.trim() ?? '';
    if (!got || !translation) return null;

    const picks: MatchedAnswer['picks'] = [];
    for (const [j, surface] of sentence.picks.entries()) {
      const hit =
        got.picks.find((pick) => pick.surface === surface) ??
        got.picks.find((pick) => loose(pick.surface) === loose(surface)) ??
        (got.picks.length === sentence.picks.length ? got.picks[j] : undefined);
      if (!hit?.term.trim() || !hit.meaning.trim()) return null;
      picks.push({
        surface,
        term: hit.term.trim(),
        meaning: hit.meaning.trim(),
      });
    }

    return { translation, picks };
  });
}
