import { Types } from 'mongoose';
import { monthKey } from '../asks/ask-usage';
import { ReaderMergeService } from './reader-merge.service';

type Mock = jest.Mock;

const model = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  deleteOne: jest.fn(),
  deleteMany: jest.fn(),
  aggregate: jest.fn(),
});

/** `findById(...)`도 `findById(...).select(...)`도 같은 문서를 준다 */
const found = (doc: unknown) =>
  Object.assign(Promise.resolve(doc), { select: () => Promise.resolve(doc) });

describe('ReaderMergeService', () => {
  const anonymousId = new Types.ObjectId().toString();
  const intoId = new Types.ObjectId().toString();
  const from = new Types.ObjectId(anonymousId);
  const into = new Types.ObjectId(intoId);

  let readers: Record<string, Mock>;
  let books: Record<string, Mock>;
  let sentences: Record<string, Mock>;
  let items: Record<string, Mock>;
  let asks: Record<string, Mock>;
  let retells: Record<string, Mock>;
  let logs: Record<string, Mock>;
  let refreshTokens: Record<string, Mock>;
  let tickets: Record<string, Mock>;
  let service: ReaderMergeService;

  beforeEach(() => {
    [
      readers,
      books,
      sentences,
      items,
      asks,
      retells,
      logs,
      refreshTokens,
      tickets,
    ] = Array.from({ length: 9 }, model);
    readers.findById.mockReturnValue(found({ accounts: [], booksFinished: 0 }));
    readers.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    asks.aggregate.mockResolvedValue([]);
    items.find.mockResolvedValue([]);

    service = new ReaderMergeService(
      readers as never,
      books as never,
      sentences as never,
      items as never,
      asks as never,
      retells as never,
      logs as never,
      refreshTokens as never,
      tickets as never,
    );
  });

  it('소셜 계정이 붙은 독자는 넘겨주지 않는다', async () => {
    readers.findById.mockReturnValue(
      found({ accounts: [{ provider: 'kakao' }], booksFinished: 0 }),
    );

    await service.absorb(anonymousId, intoId);

    expect(books.updateMany).not.toHaveBeenCalled();
    expect(readers.deleteOne).not.toHaveBeenCalled();
  });

  it('같은 독자끼리는 아무것도 하지 않는다', async () => {
    await service.absorb(intoId, intoId);

    expect(readers.findById).not.toHaveBeenCalled();
  });

  it('책·문장·질문·기록을 옮기고 익명 독자를 맨 마지막에 지운다', async () => {
    const order: string[] = [];
    books.updateMany.mockImplementation(() => order.push('books'));
    readers.deleteOne.mockImplementation(() => order.push('reader'));

    await service.absorb(anonymousId, intoId);

    expect(books.updateMany).toHaveBeenCalledWith(
      { readerId: from },
      { $set: { readerId: into, pinned: false } },
    );
    for (const m of [sentences, asks, retells, logs]) {
      expect(m.updateMany).toHaveBeenCalledWith(
        { readerId: from },
        { $set: { readerId: into } },
      );
    }
    expect(refreshTokens.deleteMany).toHaveBeenCalledWith({ readerId: from });
    expect(order).toEqual(['books', 'reader']);
  });

  it('없는 표현은 통째로 옮긴다', async () => {
    const itemId = new Types.ObjectId();
    items.find.mockResolvedValue([
      { _id: itemId, term: 'brush it off', encounters: [] },
    ]);
    items.findOne.mockResolvedValue(null);

    await service.absorb(anonymousId, intoId);

    expect(items.updateOne).toHaveBeenCalledWith(
      { _id: itemId },
      { $set: { readerId: into } },
    );
    expect(items.deleteOne).not.toHaveBeenCalled();
  });

  it('같은 표현은 새 만남만 이어 붙이고, 가리키던 질문과 짝을 돌린 뒤 지운다', async () => {
    const mine = new Types.ObjectId();
    const theirs = new Types.ObjectId();
    const shared = new Types.ObjectId();
    const fresh = new Types.ObjectId();
    items.find.mockResolvedValue([
      {
        _id: mine,
        term: 'brush it off',
        encounters: [{ sentenceId: shared }, { sentenceId: fresh }],
      },
    ]);
    items.findOne.mockResolvedValue({
      _id: theirs,
      encounters: [{ sentenceId: shared }],
    });

    await service.absorb(anonymousId, intoId);

    expect(items.updateOne).toHaveBeenCalledWith(
      { _id: theirs },
      { $push: { encounters: { $each: [{ sentenceId: fresh }] } } },
    );
    expect(asks.updateMany).toHaveBeenCalledWith(
      { 'picks.itemId': mine },
      { $set: { 'picks.$[pick].itemId': theirs } },
      { arrayFilters: [{ 'pick.itemId': mine }] },
    );
    expect(items.updateMany).toHaveBeenCalledWith(
      { 'confusedWith.itemId': mine },
      { $set: { 'confusedWith.itemId': theirs } },
    );
    expect(items.deleteOne).toHaveBeenCalledWith({ _id: mine });
  });

  it('다 읽은 권수를 더한다', async () => {
    readers.findById.mockReturnValue(found({ accounts: [], booksFinished: 2 }));

    await service.absorb(anonymousId, intoId);

    expect(readers.updateOne).toHaveBeenCalledWith(
      { _id: into },
      { $inc: { booksFinished: 2 } },
    );
  });

  it('익명으로 쓴 이번 달 질문 몫을 로그인한 계정에 더하고, 익명 쪽은 비운다', async () => {
    const month = monthKey(new Date());
    readers.findById.mockImplementation((id: Types.ObjectId) =>
      found({
        accounts: [],
        booksFinished: 0,
        askUsage: from.equals(id)
          ? { month, spent: 0.0008, batches: 4 }
          : { month, spent: 0.002, batches: 9 },
      }),
    );

    await service.absorb(anonymousId, intoId);

    expect(readers.updateOne).toHaveBeenCalledWith(
      { _id: into, 'askUsage.month': month },
      { $inc: { 'askUsage.spent': 0.0008, 'askUsage.batches': 4 } },
    );
    expect(readers.updateOne).toHaveBeenCalledWith(
      { _id: from },
      { $unset: { askUsage: 1 } },
    );
  });

  it('질문 몫은 질문을 옮기기 전에 센다', async () => {
    const order: string[] = [];
    asks.aggregate.mockImplementation(() => {
      order.push('count');
      return Promise.resolve([]);
    });
    asks.updateMany.mockImplementation(() => order.push('move'));

    await service.absorb(anonymousId, intoId);

    expect(order).toEqual(['count', 'count', 'move']);
  });
});
