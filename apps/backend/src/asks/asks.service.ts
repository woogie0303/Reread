import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book, type BookDocument } from '../books/book.schema';
import { ModelUnavailable } from '../common/claude';
import { assertPageInBook } from '../common/page-in-book';
import { ItemsService } from '../items/items.service';
import { Reader } from '../readers/reader.schema';
import { Sentence, type SentenceDocument } from '../sentences/sentence.schema';
import { AnswerService, type AskedSentence } from './anthropic/answer.service';
import { Ask, type AskDocument, type AskPick } from './ask.schema';
import {
  MAX_PICKS,
  type CreateAskDto,
  type ListAsksQuery,
} from './dto/ask.dto';
import { matchAnswer, type MatchedAnswer } from './match-answer';

/**
 * 이번 달에 얼마나 썼는지. 다 써도 담는 일은 실패하지 않는다.
 *
 * 앱에는 비율만 보낸다 — 금액은 독자에게 뜻이 없고, 토큰은 더 그렇다. 몇 번 남았는지는
 * 문장 길이에 따라 달라서 '약'으로만 말할 수 있는 어림값이다.
 */
export type AskQuota = {
  /** 이번 달 예산 중 쓴 비율. 마지막 질문이 예산을 넘길 수 있어서 1을 넘기도 한다. */
  ratio: number;
  /** 남은 예산으로 물을 수 있는 어림 횟수. 0이면 묻지 않고 담아 둔다. */
  remaining: number;
  /** 이 날 0시에 다시 찬다 */
  resetsOn: Date;
};

/** 질문 하나와, 그 질문이 붙어 있는 문장과 책 */
export type AskView = {
  ask: AskDocument;
  sentence: SentenceDocument | null;
  book: BookDocument | null;
};

/**
 * 이만큼 지나도 답도 이유도 없는 질문은 묻는 도중에 끊긴 것이다. 모델은 45초에 포기하고
 * 다시 한 번 시도하므로(`common/claude.ts`) 정상이라면 100초 안에 '대기'든 '답'이든 정해진다.
 */
export const INTERRUPTED_AFTER_MS = 3 * 60_000;

/** 물을 문장 하나 — 질문과 그 질문이 붙은 문장 */
type Entry = { ask: AskDocument; sentence: SentenceDocument };

@Injectable()
export class AsksService {
  private readonly log = new Logger(AsksService.name);

  constructor(
    @InjectModel(Ask.name) private readonly asks: Model<Ask>,
    @InjectModel(Sentence.name) private readonly sentences: Model<Sentence>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Reader.name) private readonly readers: Model<Reader>,
    private readonly answer: AnswerService,
    private readonly items: ItemsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 묻기. **문장은 언제나 먼저 저장된다.**
   *
   * 질문이 이번 달 몫을 다 썼든 모델이 답하지 않든, 옮겨 적은 문장은 남는다.
   * 담는 일이 실패하는 앱이면 읽다 말고 손이 멈추고, 그러면 이 앱이 하려던
   * 일 자체가 안 된다(ADR-0003). 답이 없는 질문은 pending으로 기다린다.
   *
   * 한 쪽에서 고른 문장들은 질문이 문장마다 생기지만 한 묶음(`batchId`)이다 —
   * 모델은 한 번 부르고, 이번 달 몫도 한 번만 쓴다. 돌려주는 것도 문장 순서대로다.
   *
   * `sentenceId`가 오면 이미 담아둔 문장을 묻는 것이라 새로 만들지 않는다 —
   * 만들면 같은 글이 두 줄이 되고, 원본은 아무것도 딸리지 않은 채 남는다(ADR-0004).
   */
  async create(readerId: string, dto: CreateAskDto): Promise<AskView[]> {
    const owner = new Types.ObjectId(readerId);
    const { book, sentences } = dto.sentenceId
      ? await this.reuse(owner, dto.sentenceId, dto.picks ?? [])
      : await this.capture(owner, dto);

    const batchId = new Types.ObjectId();
    const entries: Entry[] = [];
    for (const { sentence, picks } of sentences) {
      const ask = await this.asks.create({
        readerId: owner,
        sentenceId: sentence._id,
        batchId,
        status: 'pending',
        picks: tidy(picks).map((surface) => ({ surface })),
      });
      entries.push({ ask, sentence });
    }

    const asks = await this.attempt(readerId, entries, book);
    return asks.map((ask, i) => ({
      ask,
      sentence: entries[i].sentence,
      book,
    }));
  }

  /** 새로 옮겨 적은 문장들 — 묻기 전에 먼저 저장된다 */
  private async capture(owner: Types.ObjectId, dto: CreateAskDto) {
    const book = await this.books.findOne({ _id: dto.bookId, readerId: owner });
    if (!book) throw new NotFoundException('그 책을 찾지 못했어요.');
    assertPageInBook(book, dto.page);

    const sentences: { sentence: SentenceDocument; picks: string[] }[] = [];
    for (const asked of dto.sentences ?? []) {
      const sentence = await this.sentences.create({
        readerId: owner,
        bookId: book._id,
        text: asked.text.trim(),
        page: dto.page,
      });
      sentences.push({ sentence, picks: asked.picks });
    }

    return { book, sentences };
  }

  /** 이미 담아둔 문장 — 책은 그 문장이 알고 있다 */
  private async reuse(
    owner: Types.ObjectId,
    sentenceId: string,
    picks: string[],
  ) {
    const sentence = await this.sentences.findOne({
      _id: sentenceId,
      readerId: owner,
    });
    if (!sentence) throw new NotFoundException('그 문장을 찾지 못했어요.');

    const book = await this.books.findOne({
      _id: sentence.bookId,
      readerId: owner,
    });
    if (!book) throw new NotFoundException('그 책을 찾지 못했어요.');

    /**
     * 묻지 않고 담아둔 문장은 '마음에 들었던 문장'에 서 있었다. 묻는 순간 그 갈래를 떠나지
     * 않도록 하트를 켜 둔다 — 안 그러면 나중에 표현을 모두 지울 때 '원래 마음에 든 문장이었다'는
     * 기록이 없어서 문장이 함께 지워진다(`ItemsService.forgetOrphans`).
     */
    const wasKept =
      !sentence.favorite &&
      !(await this.asks.exists({ readerId: owner, sentenceId: sentence._id }));
    if (wasKept) {
      sentence.favorite = true;
      await sentence.save();
    }

    return { book, sentences: [{ sentence, picks }] };
  }

  /**
   * 기다리던 질문을 다시 물어본다 — 달이 바뀌었거나 연결이 돌아왔을 때. 같은
   * 묶음에서 함께 기다리던 질문도 같이 묻는다 — 한 번에 물었던 것이니 한 번에 푼다.
   */
  async resolve(readerId: string, id: string): Promise<AskView> {
    const { ask, sentence, book } = await this.find(readerId, id);
    if (ask.status === 'answered') return { ask, sentence, book };
    if (!sentence || !book)
      throw new NotFoundException('그 문장을 찾지 못했어요.');

    /** 묶음이 생기기 전의 질문은 혼자서 한 묶음이다 */
    ask.batchId ??= ask._id;
    const mates = await this.asks.find({
      readerId: new Types.ObjectId(readerId),
      batchId: ask.batchId,
      status: 'pending',
      _id: { $ne: ask._id },
    });
    const views = await this.attach(mates);
    const entries: Entry[] = [
      { ask, sentence },
      ...views.flatMap((view) =>
        view.sentence && view.book?.id === book.id
          ? [{ ask: view.ask, sentence: view.sentence }]
          : [],
      ),
    ];

    const [answered] = await this.attempt(readerId, entries, book);
    return { ask: answered, sentence, book };
  }

  /**
   * 묻는 도중에 앱이 꺼지거나 서버가 다시 떠서 끊긴 질문에 이유를 붙인다.
   *
   * 문장은 질문보다 먼저 저장되므로 잃는 것은 없다 — 다만 질문이 상태도 이유도 없이
   * 'pending'으로만 남아서, 질문을 다 썼을 때와 달리 왜 기다리는지 말해 줄 수 없었다.
   * 목록을 열 때마다 한 번 훑는다. 아직 도는 질문(3분 안)은 건드리지 않는다.
   */
  async settleInterrupted(readerId: string, now = new Date()): Promise<void> {
    await this.asks.updateMany(
      {
        readerId: new Types.ObjectId(readerId),
        status: 'pending',
        pendingReason: { $exists: false },
        createdAt: { $lt: new Date(now.getTime() - INTERRUPTED_AFTER_MS) },
      },
      { pendingReason: '중간에 끊김' },
    );
  }

  async list(readerId: string, query: ListAsksQuery): Promise<AskView[]> {
    await this.settleInterrupted(readerId);
    const filter: Record<string, unknown> = {
      readerId: new Types.ObjectId(readerId),
    };
    if (query.status) filter.status = query.status;
    if (query.sentenceId)
      filter.sentenceId = new Types.ObjectId(query.sentenceId);

    const asks = await this.asks
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit ?? 50);

    /**
     * 문장이 사라진 질문은 세우지 않는다. 문장을 지울 때 질문도 함께 지우지만, 그렇게
     * 하기 전에 지운 문장의 질문이 남아 있을 수 있다 — 글 없는 빈 줄이 된다.
     */
    const views = await this.attach(asks);
    return views.filter((view) => view.sentence);
  }

  async find(readerId: string, id: string): Promise<AskView> {
    await this.settleInterrupted(readerId);
    const ask = await this.asks.findOne({
      _id: id,
      readerId: new Types.ObjectId(readerId),
    });
    if (!ask) throw new NotFoundException('그 질문을 찾지 못했어요.');
    const [view] = await this.attach([ask]);
    return view;
  }

  /**
   * 이번 달 몫. 달이 바뀌면 저절로 찬다 — 어딘가에 남은 몫을 적어두고
   * 매달 0으로 되돌리는 대신, 이번 달에 답을 받은 질문의 비용을 더하기만 한다.
   * 되돌리는 일이 없으면 되돌리다 실패할 일도 없다.
   *
   * 횟수가 아니라 비용으로 센다 — 한 쪽에서 다섯 문장을 묻는 것과 한 문장을 묻는
   * 것은 비용이 몇 배 다르다(ADR-0003).
   */
  async quota(readerId: string): Promise<AskQuota> {
    const now = new Date();
    const reader = await this.readers.findById(readerId).select('askBonus');
    const bonus =
      reader?.askBonus?.month === monthKey(now)
        ? (reader.askBonus.credit ?? 0)
        : 0;
    const budget =
      Number(this.config.get('ASK_MONTHLY_BUDGET_USD') ?? 0.2) + bonus;

    /**
     * 묶음별로 모아 묶음 하나를 한 번으로 센다 — 남은 횟수의 어림값은 '한 번 물을 때
     * 평균 얼마'로 내야 해서다. 비용이 적히기 전에 답한 질문은 0으로 센다.
     */
    const [spent] = await this.asks.aggregate<{
      total: number;
      batches: number;
    }>([
      {
        $match: {
          readerId: new Types.ObjectId(readerId),
          status: 'answered',
          answeredAt: { $gte: startOfMonth(now) },
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$batchId', '$_id'] },
          cost: { $sum: { $ifNull: ['$cost', 0] } },
        },
      },
      { $match: { cost: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$cost' },
          batches: { $sum: 1 },
        },
      },
    ]);
    const total = spent?.total ?? 0;

    /** 이 독자가 이번 달 몇 번 물었으면 그 평균으로, 아니면 처음 잰 평균으로 어림한다 */
    const typical =
      spent && spent.batches >= 3
        ? total / spent.batches
        : Number(this.config.get('ASK_TYPICAL_COST_USD') ?? 0.01);
    const left = budget - total;

    return {
      ratio: budget > 0 ? total / budget : 1,
      /** 조금이라도 남아 있으면 한 번은 물을 수 있다 — 마지막 한 번은 넘쳐도 받는다 */
      remaining: left > 0 ? Math.max(1, Math.floor(left / typical)) : 0,
      resetsOn: startOfNextMonth(now),
    };
  }

  /**
   * 광고를 한 번 보고 사용량을 더 받는다. **한도를 다 쓴 뒤에만** 연다 — 남아 있는데
   * 받게 두면 광고가 읽는 흐름 속으로 들어온다(ADR-0003). 하루에 받을 수 있는
   * 횟수도 막는다. 앱이 보고하는 것을 서버가 광고 네트워크에 되묻지는 않아서(SSV 없음),
   * 이 상한이 조작된 요청이 낼 수 있는 손해의 크기를 정한다.
   */
  async grantAdBonus(readerId: string): Promise<AskQuota> {
    const now = new Date();
    const month = monthKey(now);
    const day = dayKey(now);
    /** 광고 한 번 수익이 질문 한 번 비용과 비슷해서, 한 번 몫만 준다(ADR-0003) */
    const perAd = Number(this.config.get('ASK_AD_BONUS_USD') ?? 0.01);
    const perDay = Number(this.config.get('ASK_AD_DAILY_LIMIT') ?? 3);

    const before = await this.quota(readerId);
    if (before.remaining > 0) {
      throw new BadRequestException('아직 이번 달 질문이 남아 있어요.');
    }

    const reader = await this.readers.findById(readerId).select('askBonus');
    const prev = reader?.askBonus;
    const sameMonth = prev?.month === month;
    const todayCount = prev?.day === day ? prev.dayCount : 0;
    if (todayCount >= perDay) {
      throw new BadRequestException(
        '오늘 받을 수 있는 광고 보상을 다 받았어요.',
      );
    }

    await this.readers.updateOne(
      { _id: readerId },
      {
        askBonus: {
          month,
          credit: (sameMonth ? (prev.credit ?? 0) : 0) + perAd,
          day,
          dayCount: todayCount + 1,
        },
      },
    );
    return this.quota(readerId);
  }

  /** 질문만 지운다. 옮겨 적은 문장은 남는다 — 답이 필요 없어졌을 뿐이다. */
  async remove(readerId: string, id: string): Promise<{ ok: true }> {
    const { ask } = await this.find(readerId, id);
    await this.asks.deleteOne({ _id: ask._id });
    return { ok: true };
  }

  /**
   * 묶음을 한 번 물어본다. 실패하는 길이 둘인데 둘 다 예외가 아니라 상태다 —
   * 이번 달 몫을 다 썼거나(질문 소진), 지금 답을 받지 못했거나(연결 실패).
   *
   * 답이 온 문장은 고른 표현을 바로 서랍에 담는다. 독자가 이미 골랐으니 한 번 더
   * 고르게 하지 않는다 — 한때 답이 온 뒤에 표현을 고르게 했는데, 고르지 않고
   * 지나간 문장이 서랍 어디에도 서지 못했다.
   */
  private async attempt(
    readerId: string,
    entries: Entry[],
    book: BookDocument,
  ): Promise<AskDocument[]> {
    const batchId = entries[0].ask.batchId;
    const counted = batchId
      ? await this.batchCounted(readerId, batchId)
      : false;
    if (!counted && (await this.quota(readerId)).remaining <= 0) {
      return this.wait(entries, '질문 소진');
    }

    const known = await Promise.all(
      entries.map(({ sentence }) => this.knownTranslation(readerId, sentence)),
    );
    const asked: AskedSentence[] = entries.map(({ ask, sentence }, i) => ({
      text: sentence.text,
      picks: ask.picks.map((pick) => pick.surface),
      knownTranslation: known[i],
    }));

    let matched: (MatchedAnswer | null)[];
    let cost: number;
    try {
      const reply = await this.answer.answer({
        sentences: asked,
        bookTitle: book.title,
        author: book.author,
        page: entries[0].sentence.page,
      });
      matched = matchAnswer(asked, reply.answer);
      cost = reply.cost;
    } catch (error) {
      if (!(error instanceof ModelUnavailable)) throw error;
      return this.wait(entries, '연결 실패');
    }
    /** 답을 받은 문장끼리 나눠 진다 — 하나도 못 받았으면 독자의 몫에서 빼지 않는다 */
    const answeredCount = matched.filter(Boolean).length;
    const share = answeredCount ? cost / answeredCount : 0;

    /**
     * 하나씩 차례로 — 두 문장에서 같은 표현을 골랐으면 동시에 담다가
     * (readerId, term) 유일 인덱스에 부딪힌다. 차례로 하면 두 번째가 재회가 된다.
     */
    const done: AskDocument[] = [];
    for (const [i, { ask, sentence }] of entries.entries()) {
      const got = matched[i];
      if (!got) {
        ask.status = 'pending';
        ask.pendingReason = '연결 실패';
        done.push(await ask.save());
        continue;
      }
      ask.translation = got.translation;
      ask.picks = await this.keep(readerId, sentence, got.picks);
      ask.status = 'answered';
      ask.answeredAt = new Date();
      ask.answeredBy = this.answer.modelName;
      ask.cost = share;
      ask.pendingReason = undefined;
      done.push(await ask.save());
    }
    return done;
  }

  /**
   * 이 문장이 전에 받은 번역. 다시 물을 때마다 모델에게 번역을 새로 시키면 '뜻 보기'의
   * 문장 뜻이 매번 달라져서, 있으면 그것을 다시 쓴다.
   */
  private async knownTranslation(
    readerId: string,
    sentence: SentenceDocument,
  ): Promise<string | undefined> {
    const prev = await this.asks
      .findOne({
        readerId: new Types.ObjectId(readerId),
        sentenceId: sentence._id,
        status: 'answered',
        translation: { $exists: true, $ne: '' },
      })
      .sort({ answeredAt: -1 })
      .select('translation');
    return prev?.translation?.trim() || undefined;
  }

  private wait(
    entries: Entry[],
    reason: '질문 소진' | '연결 실패',
  ): Promise<AskDocument[]> {
    return Promise.all(
      entries.map(({ ask }) => {
        ask.status = 'pending';
        ask.pendingReason = reason;
        return ask.save();
      }),
    );
  }

  /**
   * 이 묶음이 이번 달에 이미 한 번으로 세어졌는지. 그렇다면 묶음의 나머지를 다시
   * 물어도 몫을 더 쓰지 않는다 — 한 번에 물은 것이 일부만 답을 받았을 뿐이다.
   */
  private async batchCounted(
    readerId: string,
    batchId: Types.ObjectId,
  ): Promise<boolean> {
    const hit = await this.asks.exists({
      readerId: new Types.ObjectId(readerId),
      batchId,
      status: 'answered',
      answeredAt: { $gte: startOfMonth(new Date()) },
    });
    return Boolean(hit);
  }

  /**
   * 고른 표현을 서랍에 담는다. 이미 있던 표현이면 담는 순간이 재회다
   * (`ItemsService.save`가 만남을 하나 더 붙인다). 하나를 못 담아도 나머지와
   * 답은 남긴다 — 못 담은 것은 로그로 남기고 표현만 빠진다.
   */
  private async keep(
    readerId: string,
    sentence: SentenceDocument,
    picks: MatchedAnswer['picks'],
  ): Promise<AskPick[]> {
    const kept: AskPick[] = [];
    for (const pick of picks) {
      try {
        const { item } = await this.items.save(readerId, {
          term: pick.term,
          meaning: pick.meaning,
          sentenceId: sentence.id,
          surface: pick.surface,
        });
        kept.push({ ...pick, itemId: item._id });
      } catch (error) {
        this.log.error(
          `고른 표현을 담지 못했어요: ${pick.term} ${String(error)}`,
        );
        kept.push(pick);
      }
    }
    return kept;
  }

  /** 질문 목록에 문장과 책을 붙인다 — 기다리는 문장 화면이 그리는 것이 그것이다 */
  private async attach(asks: AskDocument[]): Promise<AskView[]> {
    if (!asks.length) return [];

    const sentences = await this.sentences.find({
      _id: { $in: asks.map((ask) => ask.sentenceId) },
    });
    const books = await this.books.find({
      _id: { $in: sentences.map((sentence) => sentence.bookId) },
    });

    const sentenceById = new Map(sentences.map((s) => [s.id, s]));
    const bookById = new Map(books.map((b) => [b.id, b]));

    return asks.map((ask) => {
      const sentence = sentenceById.get(ask.sentenceId.toString()) ?? null;
      return {
        ask,
        sentence,
        book: sentence
          ? (bookById.get(sentence.bookId.toString()) ?? null)
          : null,
      };
    });
  }
}

/** 겹친 표현은 한 번만, 앞뒤 공백 없이 — 대소문자만 다른 것도 같은 표현이다 */
function tidy(picks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of picks) {
    const surface = raw.trim();
    const key = surface.toLowerCase();
    if (!surface || seen.has(key)) continue;
    seen.add(key);
    out.push(surface);
  }
  return out.slice(0, MAX_PICKS);
}

function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dayKey(now: Date): string {
  return `${monthKey(now)}-${String(now.getDate()).padStart(2, '0')}`;
}

function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfNextMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}
