/**
 * 서버가 돌려주는 모양. 화면이 쓰는 타입과 따로 두는 이유는, 서버가 바꾼 것과
 * 화면이 바꾼 것이 한 파일에서 섞이면 어느 쪽이 원본인지 알 수 없어지기 때문이다.
 * 여기 있는 것이 원본이고, 화면 쪽 타입은 이걸 좁힌 것이다.
 */

/**
 * 장르 갈래. 백엔드 `book.schema.ts`의 GENRES와 같은 목록이다(교차 import가
 * 없어서 두 곳에 각각 적는다). 검색으로 온 책이든 직접 등록한 책이든 처음엔
 * 비어 있고, 등록 화면에서 독자가 고른다.
 */
export const GENRES = [
  '소설',
  '판타지·SF',
  '미스터리·스릴러',
  '로맨스',
  '청소년·아동',
  '에세이',
  '시',
  '희곡',
  '인문·철학',
  '역사',
  '전기·자서전',
  '사회과학',
  '경제·경영',
  '과학',
  '예술',
  '자기계발',
  '기타',
] as const;
export type Genre = (typeof GENRES)[number];
export type ItemStatus = '헷갈려요' | '외웠어요';
export type ProviderName = 'kakao' | 'naver' | 'google' | 'apple';

export type ReaderView = {
  id: string;
  nickname: string;
  email?: string;
  profileImage?: string;
  booksFinished: number;
  providers: ProviderName[];
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type SignInResult = Tokens & { reader: ReaderView };

export type ApiBook = {
  _id: string;
  title: string;
  author: string;
  pages?: number;
  cover?: string;
  genre?: Genre;
  spine: string[];
  currentPage: number;
  /** 홈 맨 위에 고정한 책 — 한 독자에 한 권뿐 */
  pinned?: boolean;
  /** 등록한 때 — 고정한 책이 없을 때 맨 위에 설 책을 이걸로 고른다 */
  createdAt?: string;
  startedAt?: string;
  lastReadAt?: string;
  finishedAt?: string;
};

export type ApiSentence = {
  _id: string;
  bookId: string;
  text: string;
  page?: number;
  note?: string;
  /** 하트 — 표현을 담은 문장도 마음에 든 문장으로 두고 싶을 때 */
  favorite?: boolean;
  /** 이 문장에 대고 남긴 내 생각 — 오래된 것부터 */
  thoughts?: ApiThought[];
  createdAt: string;
};

export type ApiThought = { _id: string; text: string; createdAt: string };

export type ApiEncounter = {
  sentenceId: string;
  surface?: string;
  savedAt: string;
};

export type ApiItem = {
  _id: string;
  term: string;
  meaning: string;
  status: ItemStatus;
  encounters: ApiEncounter[];
  confusedWith?: { itemId: string; note: string };
  createdAt: string;
  updatedAt: string;
};

export type ApiItemDetail = {
  item: ApiItem;
  encounters: {
    sentenceId: string;
    savedAt: string;
    sentence: ApiSentence | null;
    book: ApiBook | null;
  }[];
};

/**
 * 독자가 그 문장에서 고른 표현. 답이 오기 전에는 `surface`뿐이고, 답이 오면
 * 사전 꼴(`term`)과 뜻이 채워지며 서버가 그 순간 서랍에 담는다(`itemId`).
 */
export type ApiPick = {
  surface: string;
  term?: string;
  meaning?: string;
  /** 번역에서 이 표현에 해당하는 글자 — 번역에 같은 밑줄을 긋는다. 없으면 긋지 않는다. */
  translationSpan?: string;
  itemId?: string;
};

export type ApiAsk = {
  _id: string;
  sentenceId: string;
  status: 'answered' | 'pending';
  translation?: string;
  picks: ApiPick[];
  pendingReason?: '질문 소진' | '연결 실패' | '중간에 끊김';
  answeredAt?: string;
  createdAt: string;
};

export type ApiAskView = {
  ask: ApiAsk;
  sentence: ApiSentence | null;
  book: ApiBook | null;
};

/**
 * 이번 달 사용량. 서버는 실제 모델 비용으로 세고 앱에는 비율만 준다 — 금액도
 * 토큰도 독자에게는 뜻이 없다. `remaining`은 문장 길이에 따라 달라지는 어림값이다.
 */
export type ApiQuota = {
  /** 0~1, 마지막 질문이 넘치면 1을 조금 넘는다 */
  ratio: number;
  remaining: number;
  resetsOn: string;
  /** 오늘 광고로 더 받을 수 있는 횟수. 옛 서버는 보내지 않는다 */
  adsLeftToday?: number;
};
