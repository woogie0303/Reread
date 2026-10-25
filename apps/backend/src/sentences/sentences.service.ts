import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ask } from '../asks/ask.schema';
import { assertPageInBook } from '../common/page-in-book';
import { Book } from '../books/book.schema';
import { LexicalItem } from '../items/lexical-item.schema';
import { Reader } from '../readers/reader.schema';
import { Sentence, type SentenceDocument } from './sentence.schema';
import type {
  CreateSentenceDto,
  CreateThoughtDto,
  ListSentencesQuery,
  UpdateSentenceDto,
} from './dto/sentence.dto';

/**
 * 한 번에 돌려주는 줄 수의 기본값. 부르는 쪽이 아무것도 안 보내도 전 기록이
 * 나가지 않게 막는 자리다 — 상한(200)은 DTO가 건다.
 */
const DEFAULT_LIMIT = 50;

@Injectable()
export class SentencesService {
  constructor(
    @InjectModel(Sentence.name) private readonly sentences: Model<Sentence>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(LexicalItem.name) private readonly items: Model<LexicalItem>,
    @InjectModel(Ask.name) private readonly asks: Model<Ask>,
    @InjectModel(Reader.name) private readonly readers: Model<Reader>,
    private readonly config: ConfigService,
  ) {}

  async create(
    readerId: string,
    dto: CreateSentenceDto,
  ): Promise<SentenceDocument> {
    const owner = new Types.ObjectId(readerId);
    const book = await this.books.findOne({ _id: dto.bookId, readerId: owner });
    if (!book) throw new NotFoundException('그 책을 찾지 못했어요.');
    assertPageInBook(book, dto.page);
    await this.assertRoomForAnonymous(owner);

    return this.sentences.create({
      ...dto,
      bookId: new Types.ObjectId(dto.bookId),
      readerId: owner,
    });
  }

  /**
   * 로그인 없이 쓰는 독자가 '그냥 담아둔 문장'을 몇 개까지 담을 수 있는지(기본 5).
   * 문장만 담는 일은 모델 비용이 없어 막을 까닭은 못 되지만, 익명 기록은 앱을 지우면
   * 사라지니 이 선에서 로그인을 권한다 — 앱이 이 거절을 로그인 안내로 바꿔 보인다.
   *
   * **물어본 문장은 세지 않는다.** 그쪽은 이미 질문 몫(`ASK_ANON_BUDGET_USD`)이 막는다.
   * 익명 독자의 기록은 적어서 문장 전체를 훑어도 값이 싸다.
   */
  private async assertRoomForAnonymous(owner: Types.ObjectId): Promise<void> {
    const reader = await this.readers.findById(owner).select('accounts');
    if ((reader?.accounts.length ?? 1) > 0) return;

    const limit = Number(this.config.get('ANON_SENTENCE_LIMIT') ?? 5);
    const asked = await this.asks.distinct('sentenceId', { readerId: owner });
    const kept = await this.sentences.countDocuments({
      readerId: owner,
      _id: { $nin: asked },
    });
    if (kept >= limit) {
      throw new ForbiddenException(
        '로그인하면 더 많은 문장을 저장할 수 있어요.',
      );
    }
  }

  /**
   * liked=true는 '그냥 좋아서 담아둔 문장'을 뜻한다. 문장에 표시해 두지 않고
   * 만남 쪽에서 물어보는 이유는, 표현을 나중에 담거나 지우면 같은 문장이
   * 이쪽에서 저쪽으로 옮겨가기 때문이다 — 문장에 적어두면 그때마다 어긋난다.
   *
   * 물어본 문장도 뺀다. 몰라서 물어놓은 문장은 '좋아서 담아둔 줄'이 아니다 — 답을
   * 기다리는 줄이거나, 담은 표현 쪽에 서는 줄이다. 그 표현을 독자가 모두 지우면 문장은
   * 어디에도 서지 않고 그냥 사라진다(`ItemsService.forgetOrphans`).
   *
   * 다만 하트(`favorite`)를 켠 문장은 표현이 딸려 있어도 들어온다 — 독자가
   * 직접 마음에 든다고 한 줄이다.
   */
  async list(
    readerId: string,
    query: ListSentencesQuery,
  ): Promise<SentenceDocument[]> {
    const owner = new Types.ObjectId(readerId);
    const filter: Record<string, unknown> = { readerId: owner };
    if (query.bookId) filter.bookId = new Types.ObjectId(query.bookId);

    if (query.liked) {
      const claimed = await this.items.distinct('encounters.sentenceId', {
        readerId: owner,
      });
      const asked = await this.asks.distinct('sentenceId', { readerId: owner });
      filter.$or = [
        { _id: { $nin: [...claimed, ...asked] } },
        { favorite: true },
      ];
    }

    return this.sentences
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit ?? DEFAULT_LIMIT)
      .exec();
  }

  async find(readerId: string, id: string): Promise<SentenceDocument> {
    const sentence = await this.sentences.findOne({
      _id: id,
      readerId: new Types.ObjectId(readerId),
    });
    if (!sentence) throw new NotFoundException('그 문장을 찾지 못했어요.');
    return sentence;
  }

  async update(
    readerId: string,
    id: string,
    dto: UpdateSentenceDto,
  ): Promise<SentenceDocument> {
    if (dto.page !== undefined) {
      const current = await this.find(readerId, id);
      const book = await this.books.findById(current.bookId);
      if (book) assertPageInBook(book, dto.page);
    }
    const sentence = await this.sentences.findOneAndUpdate(
      { _id: id, readerId: new Types.ObjectId(readerId) },
      dto,
      { new: true },
    );
    if (!sentence) throw new NotFoundException('그 문장을 찾지 못했어요.');
    return sentence;
  }

  /** 생각 하나를 단다 — 맨 아래에 */
  async addThought(
    readerId: string,
    id: string,
    dto: CreateThoughtDto,
  ): Promise<SentenceDocument> {
    const sentence = await this.sentences.findOneAndUpdate(
      { _id: id, readerId: new Types.ObjectId(readerId) },
      { $push: { thoughts: { text: dto.text } } },
      { new: true },
    );
    if (!sentence) throw new NotFoundException('그 문장을 찾지 못했어요.');
    return sentence;
  }

  async removeThought(
    readerId: string,
    id: string,
    thoughtId: string,
  ): Promise<SentenceDocument> {
    const sentence = await this.sentences.findOneAndUpdate(
      { _id: id, readerId: new Types.ObjectId(readerId) },
      { $pull: { thoughts: { _id: new Types.ObjectId(thoughtId) } } },
      { new: true },
    );
    if (!sentence) throw new NotFoundException('그 문장을 찾지 못했어요.');
    return sentence;
  }

  /**
   * 이 문장에서 담은 표현만 지운다. 문장은 남는다 — 하트를 켠 문장이 '담은 표현' 쪽에서
   * 지워질 때, 마음에 든 문장은 그대로 두려는 길이다. 이 문장 말고는 만난 적이 없는
   * 표현은 서랍에서 함께 사라진다.
   */
  async clearExpressions(readerId: string, id: string): Promise<{ ok: true }> {
    const sentence = await this.find(readerId, id);
    await this.forgetEncounters(new Types.ObjectId(readerId), sentence._id);
    return { ok: true };
  }

  /**
   * 문장이 사라지면 그 문장을 가리키던 만남도, 만남이 다 없어진 항목도, 그 문장에
   * 대고 물은 질문도 함께 간다. 질문을 남겨두면 글 없는 질문이 '기다리는 문장'에
   * 빈 줄로 선다.
   */
  async remove(readerId: string, id: string): Promise<{ ok: true }> {
    const sentence = await this.find(readerId, id);
    const owner = new Types.ObjectId(readerId);

    await this.forgetEncounters(owner, sentence._id);
    await this.asks.deleteMany({ readerId: owner, sentenceId: sentence._id });
    await this.sentences.deleteOne({ _id: sentence._id });

    return { ok: true };
  }

  /** 그 문장을 가리키던 만남을 모든 항목에서 빼고, 만남이 다 없어진 항목은 지운다 */
  private async forgetEncounters(
    owner: Types.ObjectId,
    sentenceId: Types.ObjectId,
  ) {
    await this.items.updateMany(
      { readerId: owner, 'encounters.sentenceId': sentenceId },
      { $pull: { encounters: { sentenceId } } },
    );
    await this.items.deleteMany({ readerId: owner, encounters: { $size: 0 } });
  }
}
