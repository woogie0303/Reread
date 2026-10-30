import { Types } from 'mongoose';
import { addUsage, monthKey, readUsage } from './ask-usage';

/** `findById(...).select(...)`가 이 문서를 준다 */
function build(askUsage?: unknown) {
  const readers = {
    findById: jest.fn(() => ({
      select: () => Promise.resolve(askUsage ? { askUsage } : {}),
    })),
    updateOne: jest
      .fn()
      .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
  };
  const asks = {
    aggregate: jest.fn().mockResolvedValue([{ spent: 0.0012, batches: 5 }]),
  };
  return { readers, asks, models: { readers, asks } as never };
}

describe('ask-usage', () => {
  const readerId = new Types.ObjectId();
  const now = new Date(2026, 9, 30);
  const month = monthKey(now);

  it('이번 달 값이 적혀 있으면 질문을 세지 않는다', async () => {
    const { asks, models } = build({ month, spent: 0.003, batches: 12 });

    expect(await readUsage(models, readerId, now)).toEqual({
      spent: 0.003,
      batches: 12,
    });
    expect(asks.aggregate).not.toHaveBeenCalled();
  });

  it('값이 없거나 지난달 것이면 이번 달 질문에서 세어 적는다', async () => {
    const { readers, models } = build({
      month: '2026-09',
      spent: 0.006,
      batches: 30,
    });

    expect(await readUsage(models, readerId, now)).toEqual({
      spent: 0.0012,
      batches: 5,
    });
    expect(readers.updateOne).toHaveBeenCalledWith(
      { _id: readerId, 'askUsage.month': { $ne: month } },
      { $set: { askUsage: { month, spent: 0.0012, batches: 5 } } },
    );
  });

  it('답을 받으면 이번 달 값에 더한다', async () => {
    const { readers, asks, models } = build();

    await addUsage(models, readerId, { spent: 0.0002, batches: 1 }, now);

    expect(readers.updateOne).toHaveBeenCalledWith(
      { _id: readerId, 'askUsage.month': month },
      { $inc: { 'askUsage.spent': 0.0002, 'askUsage.batches': 1 } },
    );
    expect(asks.aggregate).not.toHaveBeenCalled();
  });

  it('더할 이번 달 값이 없으면 방금 저장한 질문까지 세어 적는다', async () => {
    const { readers, asks, models } = build();
    readers.updateOne
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

    await addUsage(models, readerId, { spent: 0.0002, batches: 1 }, now);

    expect(asks.aggregate).toHaveBeenCalledTimes(1);
    expect(readers.updateOne).toHaveBeenLastCalledWith(
      { _id: readerId, 'askUsage.month': { $ne: month } },
      { $set: { askUsage: { month, spent: 0.0012, batches: 5 } } },
    );
  });
});
