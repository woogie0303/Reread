import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ask } from '../asks/ask.schema';
import { Book } from '../books/book.schema';
import { LexicalItem } from '../items/lexical-item.schema';
import { ReadingLog } from '../reading/reading-log.schema';
import { Reader } from '../readers/reader.schema';
import { Retell } from '../retells/retell.schema';
import { Sentence } from '../sentences/sentence.schema';
import { OAuthTicket } from './schemas/oauth-ticket.schema';
import { RefreshToken } from './schemas/refresh-token.schema';

/**
 * 익명으로 쓰던 독자가 로그인하면, 익명으로 쌓은 것을 로그인한 계정으로 옮긴다.
 * 새 소셜 계정이면 막 만든 빈 독자로 옮겨지고, 다른 기기에서 이미 쓰던 계정이면 그
 * 기록과 합쳐진다 — 어느 쪽이든 익명으로 담은 것은 사라지지 않는다.
 *
 * **옮기는 것은 익명 독자에서만이다.** 소셜 계정이 붙은 독자는 남의 것을 받을 수는
 * 있어도 넘겨주지 않는다 — 로그인한 채 다른 계정으로 들어갔다고 기록이 옮겨 가면 안 된다.
 *
 * **표현은 합친다.** `(readerId, term)`이 유일해서 같은 표현을 그냥 옮기면 부딪힌다.
 * 이미 있는 표현에 익명 쪽의 만남을 이어 붙이고, 그 표현을 가리키던 질문과 헷갈리는 짝도
 * 이어 붙인 쪽으로 돌린다 — 재회는 이 인덱스가 만든다(`apps/backend/AGENTS.md`).
 *
 * **익명 독자 문서는 맨 마지막에 지운다.** 계정 삭제와 같은 이유다 — 몽고가 단일 서버면
 * 트랜잭션이 없어 중간에 끊길 수 있는데, 익명 독자가 남아 있으면 다음 로그인에서 이어서
 * 옮긴다. 그래서 몇 번을 불러도 결과가 같다.
 */
@Injectable()
export class ReaderMergeService {
  private readonly log = new Logger(ReaderMergeService.name);

  constructor(
    @InjectModel(Reader.name) private readonly readers: Model<Reader>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Sentence.name) private readonly sentences: Model<Sentence>,
    @InjectModel(LexicalItem.name) private readonly items: Model<LexicalItem>,
    @InjectModel(Ask.name) private readonly asks: Model<Ask>,
    @InjectModel(Retell.name) private readonly retells: Model<Retell>,
    @InjectModel(ReadingLog.name) private readonly logs: Model<ReadingLog>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokens: Model<RefreshToken>,
    @InjectModel(OAuthTicket.name)
    private readonly tickets: Model<OAuthTicket>,
  ) {}

  async absorb(anonymousId: string, intoId: string): Promise<void> {
    if (anonymousId === intoId) return;
    if (!Types.ObjectId.isValid(anonymousId)) return;

    const anonymous = await this.readers.findById(anonymousId);
    if (!anonymous || anonymous.accounts.length > 0) return;

    const from = new Types.ObjectId(anonymousId);
    const into = new Types.ObjectId(intoId);

    await this.mergeItems(from, into);

    /** 홈에 고정하는 책은 한 권뿐이다 — 옮겨 온 책은 고정을 풀고 원래 계정의 고정을 지킨다 */
    await this.books.updateMany(
      { readerId: from },
      { $set: { readerId: into, pinned: false } },
    );
    await Promise.all([
      this.sentences.updateMany(
        { readerId: from },
        { $set: { readerId: into } },
      ),
      this.asks.updateMany({ readerId: from }, { $set: { readerId: into } }),
      this.retells.updateMany({ readerId: from }, { $set: { readerId: into } }),
      this.logs.updateMany({ readerId: from }, { $set: { readerId: into } }),
    ]);

    if (anonymous.booksFinished > 0) {
      await this.readers.updateOne(
        { _id: into },
        { $inc: { booksFinished: anonymous.booksFinished } },
      );
    }

    await Promise.all([
      this.refreshTokens.deleteMany({ readerId: from }),
      this.tickets.deleteMany({ readerId: from }),
    ]);
    await this.readers.deleteOne({ _id: from });

    this.log.log(`익명 독자를 합쳤어요: ${anonymousId} → ${intoId}`);
  }

  /**
   * 같은 표제형이 이미 있으면 만남을 이어 붙이고 익명 쪽 표현을 지운다. 없으면 표현째
   * 옮긴다. 뜻과 상태는 원래 계정 것을 그대로 둔다 — 그쪽이 더 오래 다듬어 온 것이다.
   */
  private async mergeItems(
    from: Types.ObjectId,
    into: Types.ObjectId,
  ): Promise<void> {
    const mine = await this.items.find({ readerId: from });

    for (const item of mine) {
      const existing = await this.items.findOne({
        readerId: into,
        term: item.term,
      });

      if (!existing) {
        await this.items.updateOne(
          { _id: item._id },
          { $set: { readerId: into } },
        );
        continue;
      }

      /** 중간에 끊겼다 다시 돌 때 같은 만남이 두 번 붙지 않게 — 이미 붙은 문장은 건너뛴다 */
      const known = new Set(
        existing.encounters.map((met) => met.sentenceId.toString()),
      );
      const fresh = item.encounters.filter(
        (met) => !known.has(met.sentenceId.toString()),
      );
      if (fresh.length) {
        await this.items.updateOne(
          { _id: existing._id },
          { $push: { encounters: { $each: fresh } } },
        );
      }
      await this.asks.updateMany(
        { 'picks.itemId': item._id },
        { $set: { 'picks.$[pick].itemId': existing._id } },
        { arrayFilters: [{ 'pick.itemId': item._id }] },
      );
      await this.items.updateMany(
        { 'confusedWith.itemId': item._id },
        { $set: { 'confusedWith.itemId': existing._id } },
      );
      await this.items.deleteOne({ _id: item._id });
    }
  }
}
