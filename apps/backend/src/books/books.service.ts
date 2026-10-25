import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ask } from '../asks/ask.schema';
import { assertPageInBook } from '../common/page-in-book';
import { LexicalItem } from '../items/lexical-item.schema';
import { ReadingService } from '../reading/reading.service';
import { Sentence } from '../sentences/sentence.schema';
import { Book, type BookDocument } from './book.schema';
import type { CreateBookDto, UpdateBookDto } from './dto/book.dto';

@Injectable()
export class BooksService {
  constructor(
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Sentence.name) private readonly sentences: Model<Sentence>,
    @InjectModel(LexicalItem.name) private readonly items: Model<LexicalItem>,
    @InjectModel(Ask.name) private readonly asks: Model<Ask>,
    private readonly reading: ReadingService,
  ) {}

  /**
   * 등록하면서 '지금 몇 쪽'을 적었으면 그만큼을 오늘 읽은 것으로 남긴다. 한동안
   * 진도를 옮길 때(`update`)만 기록해서, 등록할 때 적은 쪽수는 그래프 어디에도
   * 잡히지 않았다 — 독자에게는 분명히 읽은 쪽인데.
   */
  async create(readerId: string, dto: CreateBookDto): Promise<BookDocument> {
    assertPageInBook({ pages: dto.pages }, dto.currentPage || undefined);

    const book = await this.books.create({
      ...dto,
      readerId: new Types.ObjectId(readerId),
      ...(dto.currentPage ? { lastReadAt: new Date() } : {}),
    });
    await this.reading.record(readerId, String(book._id), dto.currentPage ?? 0);
    return book;
  }

  list(readerId: string, finished?: boolean): Promise<BookDocument[]> {
    const filter: Record<string, unknown> = {
      readerId: new Types.ObjectId(readerId),
    };
    if (finished !== undefined) {
      filter.finishedAt = finished ? { $ne: null } : null;
    }
    return this.books.find(filter).sort({ createdAt: -1 }).exec();
  }

  async find(readerId: string, id: string): Promise<BookDocument> {
    const book = await this.books.findOne({
      _id: id,
      readerId: new Types.ObjectId(readerId),
    });
    if (!book) throw new NotFoundException('그 책을 찾지 못했어요.');
    return book;
  }

  /**
   * 읽은 데까지 표시를 옮기면 그 차이가 곧 오늘 읽은 양이다. 따로 적게 하지
   * 않는 이유는, 읽고 나서 한 번 더 적게 만들면 아무도 적지 않기 때문이다.
   *
   * 진도를 옮겼는데 마지막으로 읽은 날을 주지 않았으면 오늘로 찍는다 —
   * 방금 읽었다는 뜻이니까.
   */
  async update(
    readerId: string,
    id: string,
    dto: UpdateBookDto,
  ): Promise<BookDocument> {
    const before = await this.find(readerId, id);
    /**
     * `pages: null`은 '전체 쪽수를 모른다'로 되돌리는 것이다. 빼고 보내면 '안 고침'이라
     * 둘을 가른다 — 한때 앱이 비운 칸을 빼고 보내서, 쪽수를 지워도 예전 값이 남았다.
     * (DTO의 타입은 등록과 같이 쓰느라 null을 적지 않는다. `@IsOptional`이 null을 들인다.)
     */
    const clearPages = (dto as { pages?: number | null }).pages === null;
    /** 쪽수를 함께 고치는 중이면 새 쪽수로, 지우는 중이면 따지지 않고, 아니면 있던 쪽수로 */
    assertPageInBook(
      { pages: clearPages ? undefined : (dto.pages ?? before.pages) },
      dto.currentPage || undefined,
    );
    const advanced =
      dto.currentPage !== undefined ? dto.currentPage - before.currentPage : 0;

    const patch: Record<string, unknown> = { ...dto };
    if (clearPages) {
      delete patch.pages;
      patch.$unset = { pages: 1 };
    }
    if (advanced > 0 && !dto.lastReadAt) patch.lastReadAt = new Date();

    const book = await this.books.findOneAndUpdate(
      { _id: id, readerId: new Types.ObjectId(readerId) },
      patch,
      { new: true },
    );
    if (!book) throw new NotFoundException('그 책을 찾지 못했어요.');

    /** 고정은 한 권뿐 — 이 책을 고정하면 다른 책의 고정을 푼다 */
    if (dto.pinned) {
      await this.books.updateMany(
        { readerId: new Types.ObjectId(readerId), _id: { $ne: book._id } },
        { pinned: false },
      );
    }

    await this.reading.record(readerId, id, advanced);
    return book;
  }

  /**
   * 책을 지우면 그 책에서 옮겨 적은 문장도 함께 사라진다. 문장이 사라지면
   * 그 문장을 가리키던 만남도 지워야 하고, 만남이 하나도 남지 않은 어휘 항목은
   * 그때 함께 지운다 — 어디서 만났는지 말할 수 없는 항목은 서랍에서 할 말이
   * 없기 때문이다. 그 책의 읽은 기록(쪽수)도 함께 지운다.
   */
  async remove(
    readerId: string,
    id: string,
  ): Promise<{ deletedSentences: number }> {
    const book = await this.find(readerId, id);
    const owner = new Types.ObjectId(readerId);

    const sentenceIds = await this.sentences
      .find({ bookId: book._id, readerId: owner })
      .distinct('_id');

    await this.items.updateMany(
      { readerId: owner, 'encounters.sentenceId': { $in: sentenceIds } },
      { $pull: { encounters: { sentenceId: { $in: sentenceIds } } } },
    );
    await this.items.deleteMany({ readerId: owner, encounters: { $size: 0 } });
    /** 문장에 대고 물은 질문도 — 남겨두면 글 없는 질문이 '기다리는 문장'에 선다 */
    await this.asks.deleteMany({
      readerId: owner,
      sentenceId: { $in: sentenceIds },
    });
    await this.sentences.deleteMany({ _id: { $in: sentenceIds } });
    await this.reading.forgetBook(readerId, String(book._id));
    await this.books.deleteOne({ _id: book._id });

    return { deletedSentences: sentenceIds.length };
  }
}
