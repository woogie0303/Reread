import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ask } from '../asks/ask.schema';
import { Book, type BookDocument } from '../books/book.schema';
import { Sentence, type SentenceDocument } from '../sentences/sentence.schema';
import { LexicalItem, type LexicalItemDocument } from './lexical-item.schema';
import type {
  AddEncounterDto,
  ListItemsQuery,
  SaveItemDto,
  UpdateItemDto,
} from './dto/item.dto';

/**
 * 담은 결과. 이미 있던 표현이었는지, 그렇다면 처음 만난 뒤 며칠 만인지를
 * 함께 돌려준다 — 화면이 "2개월 만에 또 헷갈렸어요"라고 말할 수 있는 근거가
 * 이 두 값이다. 며칠인지를 어떤 말로 옮길지는 앱이 정한다.
 */
export type SaveResult = {
  item: LexicalItemDocument;
  reencountered: boolean;
  gapDays?: number;
  previousSavedAt?: Date;
  previousSentenceId?: Types.ObjectId;
};

/**
 * 목록 한 줄. 항목만으로는 서랍을 그릴 수 없다 — 어느 책들을 건너왔는지와
 * 가장 최근에 만난 문장 한 줄이 함께 보여야 한다. 그걸 클라이언트가 항목마다
 * 다시 물어보게 두면 스무 줄짜리 서랍이 스물한 번을 부른다.
 */
export type ItemSummary = {
  item: LexicalItemDocument;
  /** 이 항목이 건너온 책들, 중복 없이 — 왼쪽 점들이 이 색을 쓴다 */
  books: BookDocument[];
  latest: { sentence: SentenceDocument; book: BookDocument | null } | null;
  /** 처음과 마지막 만남 사이의 날수. 한 번만 만났으면 없다. */
  gapDays?: number;
};

export type ResolvedEncounter = {
  sentenceId: Types.ObjectId;
  savedAt: Date;
  sentence: SentenceDocument | null;
  book: BookDocument | null;
};

@Injectable()
export class ItemsService {
  constructor(
    @InjectModel(LexicalItem.name) private readonly items: Model<LexicalItem>,
    @InjectModel(Sentence.name) private readonly sentences: Model<Sentence>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Ask.name) private readonly asks: Model<Ask>,
  ) {}

  /**
   * 같은 표현을 두 번 만들지 않는다. (readerId, term) 유일 인덱스가 그것을
   * 막고, 두 번째 저장은 문서를 만드는 대신 만남을 하나 더 붙인다.
   *
   * 다시 만난 표현의 상태는 '헷갈려요'로 되돌린다 — 외웠다고 표시해 둔 것을
   * 또 담았다면, 외웠다는 말이 더는 사실이 아니기 때문이다.
   */
  async save(readerId: string, dto: SaveItemDto): Promise<SaveResult> {
    const owner = new Types.ObjectId(readerId);
    const sentence = await this.sentences.findOne({
      _id: dto.sentenceId,
      readerId: owner,
    });
    if (!sentence) throw new NotFoundException('그 문장을 찾지 못했어요.');

    const term = dto.term.trim();
    const existing = await this.items.findOne({ readerId: owner, term });

    if (!existing) {
      const created = await this.items.create({
        readerId: owner,
        term,
        meaning: dto.meaning,
        encounters: [
          {
            sentenceId: sentence._id,
            surface: dto.surface,
            savedAt: new Date(),
          },
        ],
      });
      return { item: created, reencountered: false };
    }

    const met = existing.encounters.find((encounter) =>
      encounter.sentenceId.equals(sentence._id),
    );
    if (met) {
      /**
       * 같은 문장에서 이미 만난 표현이다 — 재회는 아니다. 다만 독자가 고른 글자가 달라졌으면
       * (글자 인식이 'pa'로 쪼갠 것을 'patronizing'으로 고쳐 다시 물었다) 만남에 적힌 글자를
       * 새로 고른 것으로 바꾼다. 안 그러면 문장 화면의 밑줄이 옛 글자에 남는다.
       */
      if (dto.surface && met.surface !== dto.surface) {
        met.surface = dto.surface;
        await existing.save();
      }
      return { item: existing, reencountered: false };
    }

    const previous = existing.encounters[existing.encounters.length - 1];
    const first = existing.encounters[0];
    const savedAt = new Date();

    existing.encounters.push({
      sentenceId: sentence._id,
      surface: dto.surface,
      savedAt,
    });
    existing.status = '헷갈려요';
    await existing.save();

    return {
      item: existing,
      reencountered: true,
      gapDays: daysBetween(first.savedAt, savedAt),
      previousSavedAt: previous.savedAt,
      previousSentenceId: previous.sentenceId,
    };
  }

  async list(readerId: string, query: ListItemsQuery): Promise<ItemSummary[]> {
    const owner = new Types.ObjectId(readerId);
    const filter: Record<string, unknown> = { readerId: owner };
    if (query.status) filter.status = query.status;
    /** 두 번째 만남이 있는지만 보면 된다 */
    if (query.reencountered) filter['encounters.1'] = { $exists: true };
    if (query.bookId) {
      const inBook = await this.sentences
        .find({ readerId: owner, bookId: new Types.ObjectId(query.bookId) })
        .distinct('_id');
      filter['encounters.sentenceId'] = { $in: inBook };
    }

    const items = await this.items.find(filter).sort({ updatedAt: -1 });
    if (!items.length) return [];

    const sentences = await this.sentences.find({
      _id: {
        $in: items.flatMap((item) => item.encounters.map((e) => e.sentenceId)),
      },
    });
    const books = await this.books.find({
      _id: { $in: sentences.map((sentence) => sentence.bookId) },
    });

    const sentenceById = new Map(sentences.map((s) => [s.id, s]));
    const bookById = new Map(books.map((b) => [b.id, b]));

    return items.map((item) => {
      const met = item.encounters.flatMap((encounter) => {
        const sentence = sentenceById.get(encounter.sentenceId.toString());
        return sentence ? [sentence] : [];
      });
      const crossed = new Map<string, BookDocument>();
      for (const sentence of met) {
        const book = bookById.get(sentence.bookId.toString());
        if (book) crossed.set(book.id, book);
      }
      const last = met[met.length - 1];

      const encounters = item.encounters;
      return {
        item,
        books: [...crossed.values()],
        latest: last
          ? {
              sentence: last,
              book: bookById.get(last.bookId.toString()) ?? null,
            }
          : null,
        gapDays:
          encounters.length > 1
            ? daysBetween(
                encounters[0].savedAt,
                encounters[encounters.length - 1].savedAt,
              )
            : undefined,
      };
    });
  }

  async find(readerId: string, id: string): Promise<LexicalItemDocument> {
    const item = await this.items.findOne({
      _id: id,
      readerId: new Types.ObjectId(readerId),
    });
    if (!item) throw new NotFoundException('그 표현을 찾지 못했어요.');
    return item;
  }

  /**
   * 항목 하나를 열면 만난 문장이 전부 보여야 하고, 문장마다 어느 책이었는지도
   * 보여야 한다. 세 번 부르게 하지 않고 여기서 이어 붙여 돌려준다 — 재회는
   * 문장과 책을 나란히 놓아야만 눈에 보이는 사실이기 때문이다.
   */
  async findDetail(
    readerId: string,
    id: string,
  ): Promise<{ item: LexicalItemDocument; encounters: ResolvedEncounter[] }> {
    const item = await this.find(readerId, id);
    const sentenceIds = item.encounters.map(
      (encounter) => encounter.sentenceId,
    );

    const sentences = await this.sentences.find({ _id: { $in: sentenceIds } });
    const books = await this.books.find({
      _id: { $in: sentences.map((sentence) => sentence.bookId) },
    });

    const sentenceById = new Map(sentences.map((s) => [s.id, s]));
    const bookById = new Map(books.map((b) => [b.id, b]));

    const encounters = item.encounters.map((encounter) => {
      const sentence =
        sentenceById.get(encounter.sentenceId.toString()) ?? null;
      return {
        sentenceId: encounter.sentenceId,
        savedAt: encounter.savedAt,
        sentence,
        book: sentence
          ? (bookById.get(sentence.bookId.toString()) ?? null)
          : null,
      };
    });

    return { item, encounters };
  }

  async update(
    readerId: string,
    id: string,
    dto: UpdateItemDto,
  ): Promise<LexicalItemDocument> {
    const item = await this.items.findOneAndUpdate(
      { _id: id, readerId: new Types.ObjectId(readerId) },
      dto,
      { new: true },
    );
    if (!item) throw new NotFoundException('그 표현을 찾지 못했어요.');
    return item;
  }

  async addEncounter(
    readerId: string,
    id: string,
    dto: AddEncounterDto,
  ): Promise<LexicalItemDocument> {
    const owner = new Types.ObjectId(readerId);
    const item = await this.find(readerId, id);
    const sentence = await this.sentences.findOne({
      _id: dto.sentenceId,
      readerId: owner,
    });
    if (!sentence) throw new NotFoundException('그 문장을 찾지 못했어요.');

    if (
      item.encounters.some((encounter) =>
        encounter.sentenceId.equals(sentence._id),
      )
    ) {
      throw new ConflictException('이미 이 문장에서 담아둔 표현이에요.');
    }

    item.encounters.push({
      sentenceId: sentence._id,
      surface: dto.surface,
      savedAt: new Date(),
    });
    item.status = '헷갈려요';
    return item.save();
  }

  /**
   * 만남 하나만 떼어낸다. 마지막 하나까지 떼면 항목 자체를 지운다 —
   * 어디서 만났는지 말할 수 없는 항목은 서랍에서 할 말이 없다.
   */
  async removeEncounter(
    readerId: string,
    id: string,
    sentenceId: string,
  ): Promise<{ removed: 'encounter' | 'item' }> {
    return this.removeEncounters(readerId, id, [sentenceId]);
  }

  /**
   * 이 표현을 고른 문장들에서 한꺼번에 뺀다. 한 문서를 한 번에 고쳐서, 여러 번에 나눠
   * 부르다 도중에 끊기는 일이 없다. 만남이 하나도 안 남으면 표현도 함께 사라진다.
   *
   * 표현이 빠져서 담은 표현이 하나도 안 남은 문장은 서랍 어디에도 설 곳이 없어서 문장도
   * 함께 정리한다(`forgetOrphans`).
   */
  async removeEncounters(
    readerId: string,
    id: string,
    sentenceIds: string[],
  ): Promise<{ removed: 'encounter' | 'item'; sentencesRemoved: number }> {
    const item = await this.find(readerId, id);
    const targets = new Set(sentenceIds);
    const hit = item.encounters.filter((encounter) =>
      targets.has(encounter.sentenceId.toString()),
    );
    if (!hit.length) {
      throw new NotFoundException('그 문장에서 담은 기록이 없어요.');
    }

    const gone = hit.map((encounter) => encounter.sentenceId);
    const remaining = item.encounters.filter(
      (encounter) => !targets.has(encounter.sentenceId.toString()),
    );

    let removed: 'encounter' | 'item';
    if (!remaining.length) {
      await this.items.deleteOne({ _id: item._id });
      removed = 'item';
    } else {
      item.encounters = remaining;
      await item.save();
      removed = 'encounter';
    }

    return {
      removed,
      sentencesRemoved: await this.forgetOrphans(readerId, gone),
    };
  }

  async remove(readerId: string, id: string): Promise<{ ok: true }> {
    const item = await this.find(readerId, id);
    const gone = item.encounters.map((encounter) => encounter.sentenceId);
    await this.items.deleteOne({ _id: item._id });
    await this.forgetOrphans(readerId, gone);
    return { ok: true };
  }

  /**
   * 담은 표현이 하나도 안 남은 문장을 정리한다. 물어서 표현을 담은 문장은 '담은 표현'
   * 쪽에만 서고(마음에 든 문장에는 하트를 켠 것만 든다), 그 표현을 독자가 모두 지우면
   * 어느 갈래에도 안 선다 — 보이지 않는 채로 남겨두는 대신 문장과 질문을 함께 지운다.
   *
   * 지우지 않는 경우: 하트를 켠 문장(마음에 든 문장에 선다 — 묻지 않고 담아둔 문장은 묻는
   * 순간 하트가 켜진다), 답을 기다리는 질문이 있는 문장(기다리는 문장에 선다). 내 생각은
   * 마음에 든 문장에서만 달 수 있어서, 생각이 달린 문장은 늘 마음에 든 문장이었다 — 하트가
   * 켜지기 전에 물은 옛 문장이면 여기서 하트를 켜 두고 지우지 않는다.
   */
  private async forgetOrphans(
    readerId: string,
    sentenceIds: Types.ObjectId[],
  ): Promise<number> {
    const owner = new Types.ObjectId(readerId);
    let removed = 0;

    for (const sentenceId of sentenceIds) {
      const stillClaimed = await this.items.exists({
        readerId: owner,
        'encounters.sentenceId': sentenceId,
      });
      if (stillClaimed) continue;

      const sentence = await this.sentences.findOne({
        _id: sentenceId,
        readerId: owner,
      });
      if (!sentence || sentence.favorite) continue;

      const asked = await this.asks.find({ readerId: owner, sentenceId });
      /** 묻지 않고 담아둔 문장은 원래 마음에 든 문장이다 — 건드리지 않는다 */
      if (!asked.length) continue;
      if (asked.some((ask) => ask.status === 'pending')) continue;

      if (sentence.thoughts.length) {
        await this.sentences.updateOne(
          { _id: sentence._id },
          { favorite: true },
        );
        continue;
      }

      await this.asks.deleteMany({ readerId: owner, sentenceId });
      await this.sentences.deleteOne({ _id: sentence._id });
      removed += 1;
    }

    return removed;
  }
}

/** 처음 만난 날과 마지막으로 만난 날 사이. 이 간격이 제품의 요지다. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
