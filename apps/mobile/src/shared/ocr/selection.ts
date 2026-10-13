/**
 * 단어를 골라 물을 문장을 만드는 규칙. 사진 위의 단어(`OcrWord`)에도, 손으로 적은
 * 글을 쪼갠 단어(`tokenize`)에도 똑같이 쓴다 — 둘 다 `{ text }`의 줄일 뿐이다.
 *
 * 독자는 **모르는 단어만** 누른다. 문장은 여기서 만든다 — 고른 단어의 앞뒤를
 * 문장 경계까지 넓혀서. 조각(`make out whether`)만 보내면 맥락 없는 뜻풀이가 되어
 * ADR-0001이 막으려던 그 상태로 돌아간다.
 *
 * 서버에 줄을 보내 문장으로 이어달라고 하지 않는다. 경계는 마침표로 충분히 찾고,
 * 틀리면 독자가 시트에서 문장을 고친다 — 호출 하나를 아끼는 쪽이 낫다.
 */

type Word = { text: string };

/** 한 번에 물을 수 있는 문장 수. 넘으면 고르기를 막는다 — 서버도 한 번 더 자른다. */
export const MAX_SENTENCES = 5;
/** 한 문장에서 고를 수 있는 표현 수 — 서버와 같은 수 */
export const MAX_PICKS = 8;
/** 고른 표현 하나의 길이 — 구(句)를 고르는 것이지 문단을 고르는 것이 아니다. 서버와 같은 수 */
export const MAX_PICK_CHARS = 120;

/**
 * 문장이 여기서 끝난다고 보는 글자.
 *
 * 마침표 뒤에 닫는 부호가 여럿 붙을 수 있다(`her?”`, `said.’”`). 책은 곧은
 * 따옴표가 아니라 **둥근 따옴표**(`”` `’`)를 쓰고, 인식기는 그걸 가끔 `»`로
 * 읽는다 — 곧은 따옴표만 보면 대사 한 줄을 고를 때 다음 대사까지 넘어간다.
 */
const ENDS = /[.!?…]["'”’»)\]]*$/;

/**
 * 마침표로 끝나도 문장이 끝난 게 아닌 단어. 칭호와 흔한 줄임말, 이름 머리글자
 * (`J.`)다. 여기서 끊으면 'Mr.'에서 문장이 잘려 엉뚱한 반쪽을 묻게 된다.
 * `etc.`는 일부러 넣지 않았다 — 문장 끝에 오는 일이 더 많다.
 */
const NOT_ENDS = new Set([
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'st.',
  'prof.',
  'sr.',
  'jr.',
  'mt.',
  'vs.',
  'e.g.',
  'i.e.',
  'cf.',
  'no.',
]);

function ends(word: Word): boolean {
  const bare = word.text.replace(/^["'“‘(\[«]+/, '').toLowerCase();
  if (NOT_ENDS.has(bare)) return false;
  /** 이름 머리글자 — 'J. K. Rowling' */
  if (/^[a-z]\.$/.test(bare)) return false;
  return ENDS.test(word.text);
}

/** 고른 표현 하나 — 한 손짓으로 고른 단어들의 범위 */
export type Pick = { from: number; to: number; surface: string };

/** 물을 문장 하나와, 그 안에서 고른 표현들 */
export type SentenceGroup = {
  from: number;
  to: number;
  text: string;
  picks: Pick[];
};

/** 손으로 적은 글을 단어로 쪼갠다. 사진의 단어와 같은 모양이 된다. */
export function tokenize(text: string): Word[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((piece) => ({ text: piece }));
}

/** 그 단어가 든 문장의 범위 */
export function sentenceAround(
  words: Word[],
  from: number,
  to: number = from,
): { from: number; to: number } {
  let start = from;
  while (start > 0 && !ends(words[start - 1])) start -= 1;
  let end = to;
  while (end < words.length - 1 && !ends(words[end])) end += 1;
  return { from: start, to: end };
}

/**
 * 고른 단어가 문장에 실릴 꼴. 단어에 붙은 문장부호는 뗀다 — 'off,'를 고른 것은
 * 'off'를 고른 것이다. 단어 가운데의 부호(`don't`, `well-known`)는 둔다.
 */
export function surfaceOf(words: Word[], from: number, to: number): string {
  return words
    .slice(from, to + 1)
    .map((word) => word.text)
    .join(' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** 단어 번호의 범위 — 양 끝을 포함한다 */
export type Range = { from: number; to: number };

/**
 * 고른 표현들을 앞에서부터 가지런히 한다. **겹치는 것만** 합친다 — 이웃해 있다고 합치지
 * 않는다. 한 표현은 손짓이 정한다: 누르면 단어 하나, 끌면 지나간 만큼. 그래서
 * `mesmerized.`와 `For once,`를 따로 눌렀으면 바로 옆이어도 두 표현이다.
 */
export function rangesOf(ranges: Iterable<Range>): Range[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

/** 고른 표현에 든 단어 번호들 */
export function indicesOf(ranges: Iterable<Range>): Set<number> {
  const set = new Set<number>();
  for (const { from, to } of ranges)
    for (let i = from; i <= to; i += 1) set.add(i);
  return set;
}

/**
 * 단어 하나를 눌렀을 때. 이미 고른 표현 안의 단어면 **그 표현 전체**를 푼다 — 구를
 * 단어 하나씩 풀게 하면 가운데가 빠져 두 토막이 된다. 아니면 그 단어 하나가 새 표현이다.
 */
export function toggleRange(ranges: Range[], index: number): Range[] {
  const hit = ranges.some((r) => index >= r.from && index <= r.to);
  return hit
    ? ranges.filter((r) => !(index >= r.from && index <= r.to))
    : rangesOf([...ranges, { from: index, to: index }]);
}

/** 이 범위와 겹치는 표현을 모두 뺀다 — 시트의 칩에서 표현 하나를 뺄 때 */
export function without(ranges: Range[], from: number, to: number): Range[] {
  return ranges.filter((r) => r.to < from || r.from > to);
}

/**
 * 고른 표현들을 문장별로 나눈다. 같은 문장에 든 표현은 한 문장 아래 모인다. 끌어서 고르는
 * 표현은 문장 끝을 넘지 못하므로(`useWordPaint`) 두 문장을 잇는 표현은 생기지 않는다.
 */
export function groupBySentence(
  words: Word[],
  selected: Iterable<Range>,
): SentenceGroup[] {
  const runs = rangesOf(selected).filter(
    (run) => run.from >= 0 && run.to < words.length,
  );

  const groups: SentenceGroup[] = [];
  for (const run of runs) {
    const span = sentenceAround(words, run.from, run.to);
    const pick: Pick = {
      ...run,
      surface: surfaceOf(words, run.from, run.to),
    };
    const last = groups[groups.length - 1];
    /** 덩어리는 앞에서부터 오므로 바로 앞 문장과만 겹칠 수 있다 */
    if (last && span.from <= last.to) {
      last.to = Math.max(last.to, span.to);
      last.picks.push(pick);
    } else {
      groups.push({ ...span, text: '', picks: [pick] });
    }
  }

  return groups
    .map((group) => ({
      ...group,
      text: words
        .slice(group.from, group.to + 1)
        .map((word) => word.text)
        .join(' '),
      /** 부호만 고른 덩어리('—')는 표현이 아니다 */
      picks: group.picks.filter((pick) => pick.surface),
    }))
    .filter((group) => group.picks.length);
}

/**
 * 막힌 이유 — 문장이 너무 많거나, 표현이 너무 많거나, 한 표현이 너무 길거나, 같은 문장에서
 * 같은 단어를 또 골랐다(밑줄이 어느 쪽인지 가를 수 없다).
 */
export type Limit = 'sentences' | 'picks' | 'long' | 'duplicate';

/** 막힌 이유를 독자에게 한국어로 */
export function limitMessage(reason: Limit): string {
  switch (reason) {
    case 'sentences':
      return `한 번에 ${MAX_SENTENCES}문장까지 물을 수 있어요`;
    case 'picks':
      return `한 문장에서 표현은 ${MAX_PICKS}개까지 고를 수 있어요`;
    case 'long':
      return `표현은 ${MAX_PICK_CHARS}자까지만 고를 수 있어요. 구만 골라 주세요`;
    case 'duplicate':
      return '이미 선택된 표현이에요';
  }
}

/**
 * 이 고르기가 한 번에 물을 수 있는 것을 넘는지. `whole`이면 글 전체를 한 문장으로
 * 묻는다(손으로 적은 글) — 표현 수를 글 전체에서 센다.
 */
export function overflows(
  words: Word[],
  selected: Iterable<Range>,
  { maxSentences = MAX_SENTENCES, whole = false } = {},
): Limit | null {
  const runs = rangesOf(selected);
  /** 끌다가 문단째 골라 버리는 일을 막는다 — 서버도 이 길이에서 거절한다 */
  if (
    runs.some(
      (run) => surfaceOf(words, run.from, run.to).length > MAX_PICK_CHARS,
    )
  )
    return 'long';
  if (whole) {
    if (hasRepeat(runs.map((run) => surfaceOf(words, run.from, run.to))))
      return 'duplicate';
    return runs.length > MAX_PICKS ? 'picks' : null;
  }

  const groups = groupBySentence(words, selected);
  if (groups.some((group) => hasRepeat(group.picks.map((p) => p.surface))))
    return 'duplicate';
  if (groups.length > maxSentences) return 'sentences';
  if (groups.some((group) => group.picks.length > MAX_PICKS)) return 'picks';
  return null;
}

/**
 * 같은 글자의 표현이 둘 이상인가. 한 문장에서 같은 단어를 두 번 고르지 못한다 — 줄은 처음
 * 나온 자리에만 그어져서, 둘째를 골라도 첫째에 밑줄이 서고 칩만 둘이 된다.
 */
export function hasRepeat(surfaces: string[]): boolean {
  const seen = new Set<string>();
  for (const surface of surfaces) {
    const key = surface.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * 고친 문장에서 고른 표현이 선 자리. **온전한 단어로** 있어야 한다 — 'pa'를 골랐는데
 * 글을 'patronizing'으로 고쳤으면 'pa'는 더 이상 문장에 없는 표현이다. 부분 문자열로
 * 찾으면 사라진 표현을 있다고 보고, 줄을 엉뚱한 글자에 긋는다.
 */
export function locate(
  sentence: string,
  surface: string,
): { from: number; to: number } | null {
  if (!surface) return null;
  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`,
    'iu',
  ).exec(sentence);
  if (!hit) return null;
  const from = hit.index + hit[1].length;
  return { from, to: from + hit[2].length };
}

/**
 * 고친 문장에 고른 표현이 아직 있는지. 시트에서 독자가 문장을 고치다 표현을
 * 지웠을 수 있다 — 없는 것을 물으면 모델이 문장 밖의 뜻을 지어낸다.
 */
export function pickStillIn(sentence: string, surface: string): boolean {
  return locate(sentence, surface) !== null;
}

/** 단어 하나 — 사이의 apostrophe·하이픈은 단어 안이다(`don't`, `well-known`) */
export const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/**
 * 글을 고쳤을 때 고른 표현이 **고친 글자를 따라가게** 한다. 글자 인식이 단어를 쪼갰을 때
 * (`pa` + `tronizing`) 독자가 글을 `patronizing`으로 고치면, 고른 `pa`는 그 단어의 일부가
 * 되었을 뿐 같은 표현이다 — 막지 않고 단어 전체로 넓힌다.
 *
 * 고친 자리는 앞뒤로 같은 글자를 빼고 남은 구간이다. 고르던 글자가 그대로 남았고(앞뒤에
 * 글자만 붙었고) 그것이 더 큰 단어 안에 들어 있을 때만 따라간다. 글자 자체를 지웠거나 다른
 * 글자로 바꾼 표현은 그대로 둔다 — 문장에서 사라졌다고 알려야 한다.
 */
export function followEdit(
  before: string,
  after: string,
  surfaces: string[],
): string[] {
  if (before === after) return surfaces;

  let pre = 0;
  const max = Math.min(before.length, after.length);
  while (pre < max && before[pre] === after[pre]) pre += 1;
  let suf = 0;
  while (
    suf < max - pre &&
    before[before.length - 1 - suf] === after[after.length - 1 - suf]
  )
    suf += 1;
  const delta = after.length - before.length;
  const oldEnd = before.length - suf;

  const tokens = [...after.matchAll(WORD)].map((m) => ({
    from: m.index ?? 0,
    to: (m.index ?? 0) + m[0].length,
    text: m[0],
  }));

  return surfaces.map((surface) => {
    const was = locate(before, surface);
    if (!was || locate(after, surface)) return surface;

    const from = was.from >= oldEnd ? was.from + delta : was.from;
    const to = was.to <= pre ? was.to : was.to + delta;
    if (after.slice(from, to).toLowerCase() !== surface.toLowerCase())
      return surface;

    const word = tokens.find((t) => t.from <= from && to <= t.to);
    return word && word.text.toLowerCase() !== surface.toLowerCase()
      ? word.text
      : surface;
  });
}
