import type { Book } from '@/entities/book/model/types';
import type { ItemSummary } from '@/entities/lexical-item/api/item.api';
import type { ApiAskView, ApiSentence } from '@/shared/api/types';
import { savedLabel } from '@/shared/lib/date';
import type { SentenceCardData, SentenceMark } from '../model/types';

/**
 * 서버에서 온 네 조각을 서랍의 한 목록으로 합친다(ADR-0004).
 *
 * 서버 호출과 떼어 둔 이유는, 합치는 규칙이 화면의 규칙이라 눈으로 확인할 수
 * 있어야 하기 때문이다 — 특히 두 원천이 겹치지 않는다는 전제와, 밑줄을 담은
 * 항목에서만 가져온다는 규칙이 그렇다. 여기서는 react-native를 끌어오는 것을
 * 아무것도 부르지 않는다(그래서 `toBook`도 쓰지 않고 `books`로 받아 맞춘다).
 *
 * 책은 언제나 `books`에서 찾는다. 질문 응답에도 책이 붙어 오지만 출처가 둘이면
 * 같은 책이 두 모양으로 그려질 수 있고, 표지·책등 색이 곧 출처인 디자인에서 그건
 * 같은 책을 다른 책으로 보이게 만든다.
 */
export function buildFeed(input: {
  asks: ApiAskView[];
  liked: ApiSentence[];
  books: Book[];
  items: ItemSummary[];
}): SentenceCardData[] {
  const byId = new Map(input.books.map((b) => [b.id, b]));
  const marks = marksBySentence(input.items);
  const claimed = new Set(
    input.items.flatMap((item) => item.encounters.map((met) => met.sentenceId)),
  );

  /** 물어본 문장 — 책과 번역이 이미 붙어서 온다 */
  const asked: SentenceCardData[] = input.asks.flatMap((view) => {
    if (!view.sentence) return [];
    const answered = view.ask.status === 'answered';
    return [
      {
        id: view.sentence._id,
        text: view.sentence.text,
        page: view.sentence.page,
        book: byId.get(view.sentence.bookId),
        asked: true,
        favorite: view.sentence.favorite,
        pending: !answered,
        translation: answered ? view.ask.translation : undefined,
        translationSpans: answered
          ? view.ask.picks.flatMap((pick) =>
              pick.translationSpan ? [pick.translationSpan] : [],
            )
          : undefined,
        marks: marks.get(view.sentence._id) ?? [],
        claimed: claimed.has(view.sentence._id),
        savedLabel: savedLabel(view.sentence.createdAt),
        savedAt: view.sentence.createdAt,
      },
    ];
  });

  /**
   * 그냥 담아둔 문장 — 서버가 책을 붙여주지 않아서 여기서 맞춘다.
   * 책을 못 찾아도 버리지 않는다: 표지만 없을 뿐 문장은 내 것이다.
   */
  const kept: SentenceCardData[] = input.liked.map((s) => ({
    id: s._id,
    text: s.text,
    page: s.page,
    book: byId.get(s.bookId),
    asked: false,
    favorite: s.favorite,
    marks: marks.get(s._id) ?? [],
    claimed: claimed.has(s._id),
    savedLabel: savedLabel(s.createdAt),
    savedAt: s.createdAt,
  }));

  /**
   * 같은 문장이 두 번 서지 않게 막는다. 서버의 `liked` 정의상 두 원천은
   * 겹치지 않지만, 그 정의가 바뀌면 조용히 줄이 둘로 늘어난다 — 목록이
   * 겹치는 것은 눈으로 바로 안 보이니 여기서 못 박아 둔다.
   */
  const seen = new Set<string>();
  const merged = [...asked, ...kept].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });

  /** 담은 순서대로 — 두 원천을 시간 하나로 합친다 */
  return merged.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

/**
 * 문장 하나에 걸린 밑줄들. 항목 목록을 문장 기준으로 뒤집은 것이다 —
 * 문장→항목 방향 API가 없다.
 *
 * `surface`가 없는 만남은 건너뛴다: 문장 어디에 그어야 할지 알 수 없고,
 * 사전이 없어서(ADR-0002) 되살릴 방법도 없다.
 */
function marksBySentence(items: ItemSummary[]): Map<string, SentenceMark[]> {
  const out = new Map<string, SentenceMark[]>();
  for (const item of items) {
    for (const met of item.encounters) {
      if (!met.surface) continue;
      const mark: SentenceMark = {
        surface: met.surface,
        term: item.term,
        meaning: item.meaning,
        itemId: item.id,
        met: item.met,
      };
      const list = out.get(met.sentenceId);
      if (list) list.push(mark);
      else out.set(met.sentenceId, [mark]);
    }
  }
  return out;
}
