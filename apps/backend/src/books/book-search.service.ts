import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type BookSearchResult = {
  title: string;
  author: string;
  pages?: number;
  cover?: string;
  publisher?: string;
};

/** 한 곳이 답하지 못했다 — 다음 곳으로 넘어갈 신호 */
class SourceFailed extends Error {}

type Source = { name: string; run: () => Promise<BookSearchResult[]> };

const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** 같은 검색어를 10분 동안은 다시 밖으로 묻지 않는다 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

/**
 * 책을 찾아준다. 독자는 모국어 책도, 다른 나라 원서도 읽는다 — **검색어의 언어가 곧
 * 찾는 책의 언어**라고 보고 찾을 곳을 고른다.
 *
 * - **한글이 들어 있으면 카카오 책 검색.** 한국 책은 여기가 압도적이다(「채식주의자」
 *   45건 대 Open Library 1건).
 * - **그 밖의 모든 언어는 Open Library.** 원서를 원서 그대로 찾는다. 카카오로 원서
 *   제목을 찾으면 번역판이 먼저 뜬다 — 「Klara and the Sun」을 치면 「클라라와 태양」이,
 *   「ノルウェイの森」를 치면 「상실의 시대」가 1위다. 원서를 찾는 사람에게 틀린 답이다.
 *
 * 그래서 두 곳의 결과를 **섞지 않는다.** 섞으면 원서를 찾는 사람 앞에 번역판이 끼어든다.
 *
 * 앞의 곳이 막히면 다음 곳으로 넘어간다. 모두 막히면 빈 목록이 아니라 **오류**를 준다. 빈 목록은
 * 앱이 "찾는 책이 없어요"라고 말하게 해서, 막힌 것을 독자 탓으로 돌린다.
 *
 * Open Library는 **서버 전체에 초당 1건**(연락처를 밝히면 3건)이 한도다 — 사용자마다가
 * 아니다. 그래서 같은 검색어는 잠시 캐시하고, 앱은 입력이 멈춘 뒤에만 묻는다.
 *
 * Open Library는 **3자 미만을 거절한다**(422, "Query too short"). 비한글 1~2자는
 * 부를 곳이 Open Library뿐이라 어차피 실패하므로, 아예 부르지
 * 않고 빈 목록을 준다 — 이것도 "막힘"이 아니라 "아직 찾은 게 없음"이다.
 */
@Injectable()
export class BookSearchService {
  private readonly log = new Logger(BookSearchService.name);
  private readonly cache = new Map<
    string,
    { at: number; results: BookSearchResult[] }
  >();

  constructor(private readonly config: ConfigService) {}

  async search(query: string): Promise<BookSearchResult[]> {
    const q = query.trim();
    const key = q.toLowerCase();

    /**
     * Open Library는 3자 미만을 422로 거절한다("Query too short"). 비한글
     * 1~2자는 Open Library가 유일한 곳이라 이 요청은
     * 어차피 실패한다 — 막힌 걸로 보고하지 않고 조용히 빈 목록을 준다.
     * 카카오는 이런 하한이 없어서 한글은 이 줄에 걸리지 않는다.
     */
    if (!HANGUL.test(q) && q.length > 0 && q.length < 3) return [];

    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

    for (const source of this.sourcesFor(q)) {
      try {
        const results = dedupe(await source.run());
        this.remember(key, results);
        return results;
      } catch (error) {
        this.log.warn(
          `${source.name}이(가) 답하지 않아 다음 곳으로 넘어가요: ${String(error)}`,
        );
      }
    }

    throw new ServiceUnavailableException(
      '책 검색이 잠시 막혔어요. 직접 입력해 주세요.',
    );
  }

  /** 검색어 언어에 맞는 곳부터. 키가 없는 곳은 아예 넣지 않는다. */
  private sourcesFor(q: string): Source[] {
    const kakaoKey = this.config.get<string>('KAKAO_CLIENT_ID');

    const kakao: Source | null = kakaoKey
      ? { name: '카카오 책 검색', run: () => this.kakao(q, kakaoKey) }
      : null;
    const openLibrary: Source = {
      name: 'Open Library',
      run: () => this.openLibrary(q),
    };

    const order = HANGUL.test(q) ? [kakao, openLibrary] : [openLibrary];
    return order.filter((source): source is Source => source !== null);
  }

  private remember(key: string, results: BookSearchResult[]) {
    /** Map은 넣은 순서를 지킨다 — 가장 먼저 넣은 것부터 버린다 */
    if (this.cache.size >= CACHE_MAX) {
      const [oldest] = this.cache.keys();
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { at: Date.now(), results });
  }

  /**
   * 카카오(다음) 책 검색. 카카오 로그인에 쓰는 REST API 키(`KAKAO_CLIENT_ID`)를 그대로
   * 쓴다 — 같은 앱의 키라 따로 발급받을 게 없다. 무료, 하루 3만 건.
   */
  private async kakao(q: string, key: string): Promise<BookSearchResult[]> {
    const url = new URL('https://dapi.kakao.com/v3/search/book');
    url.searchParams.set('query', q);
    url.searchParams.set('size', '20');

    const body = await fetchJson<KakaoResponse>(url, 'Kakao', {
      Authorization: `KakaoAK ${key}`,
    });
    return (body.documents ?? []).map(fromKakao).filter(isResult);
  }

  private async openLibrary(q: string): Promise<BookSearchResult[]> {
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '20');
    /** 필요한 필드만 — 전부 받으면 한 권에 수십 개 필드가 딸려 와서 느리다 */
    url.searchParams.set(
      'fields',
      'title,author_name,number_of_pages_median,cover_i,publisher',
    );

    /**
     * Open Library는 누가 부르는지 밝히라고 한다. 연락처 메일까지 밝히면 한도가 초당
     * 1건에서 3건으로 오른다. 메일은 외부로 나가는 값이라 설정으로만 받는다.
     */
    const contact = this.config.get<string>('OPEN_LIBRARY_CONTACT');
    const agent = contact ? `Reread/1.0 (${contact})` : 'Reread/1.0';

    /**
     * 초당 1건(또는 3건) 한도라, 같은 서버에서 방금 다른 검색이 지나갔으면
     * 429로 바로 떨어진다. 여기서만 한 번 쉬었다 재시도한다 — 카카오·구글은
     * 한도가 넉넉해서 이럴 일이 없다.
     */
    const body = await fetchJson<OpenLibraryResponse>(
      url,
      'Open Library',
      { 'User-Agent': agent },
      { retryOn429After: 1100 },
    );
    return (body.docs ?? []).map(fromOpenLibrary).filter(isResult);
  }
}

/** 응답하지 않거나 2xx가 아니면 SourceFailed — 다음 곳으로 넘어가게 */
async function fetchJson<T>(
  url: URL,
  name: string,
  headers?: Record<string, string>,
  options?: { retryOn429After: number },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch (error) {
    throw new SourceFailed(`${name} 연결 실패: ${String(error)}`);
  }

  if (response.status === 429 && options) {
    await sleep(options.retryOn429After);
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new SourceFailed(`${name} 연결 실패: ${String(error)}`);
    }
  }

  if (!response.ok) throw new SourceFailed(`${name} ${response.status}`);
  return (await response.json()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isResult = (book: BookSearchResult | null): book is BookSearchResult =>
  book !== null;

/**
 * 판만 다르고 보이는 것은 똑같은 줄을 하나로. 카카오는 같은 제목·지은이·출판사를
 * ISBN만 달리해서 여러 번 준다 — 목록에 같은 줄이 반복되면 무엇을 골라야 할지 모른다.
 */
function dedupe(results: BookSearchResult[]): BookSearchResult[] {
  const seen = new Set<string>();
  return results.filter((book) => {
    const id =
      `${book.title}|${book.author}|${book.publisher ?? ''}`.toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

type KakaoResponse = { documents?: KakaoDocument[] };
type KakaoDocument = {
  title?: string;
  authors?: string[];
  publisher?: string;
  /** 표지가 없으면 빈 문자열로 온다 */
  thumbnail?: string;
};

/** 카카오는 쪽수를 주지 않는다 — 책 추가 화면에서 직접 넣는다 */
function fromKakao(doc: KakaoDocument): BookSearchResult | null {
  if (!doc.title) return null;

  return {
    title: doc.title,
    author: doc.authors?.length ? doc.authors.join(', ') : '지은이 미상',
    cover: doc.thumbnail || undefined,
    publisher: doc.publisher || undefined,
  };
}

type OpenLibraryResponse = { docs?: OpenLibraryDoc[] };
type OpenLibraryDoc = {
  title?: string;
  author_name?: string[];
  /** 판마다 쪽수가 달라서 Open Library가 여러 판의 가운데값을 준다 */
  number_of_pages_median?: number;
  cover_i?: number;
  publisher?: string[];
};

function fromOpenLibrary(doc: OpenLibraryDoc): BookSearchResult | null {
  if (!doc.title) return null;

  return {
    title: doc.title,
    author: doc.author_name?.join(', ') ?? '지은이 미상',
    pages: doc.number_of_pages_median,
    cover: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : undefined,
    publisher: doc.publisher?.[0],
  };
}
