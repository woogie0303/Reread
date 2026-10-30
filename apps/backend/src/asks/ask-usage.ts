import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { Reader } from '../readers/reader.schema';
import type { Ask } from './ask.schema';

/** 이번 달에 쓴 모델 비용(달러)과 물어본 횟수(묶음 수) */
export type AskUsage = { spent: number; batches: number };

type Models = { readers: Model<Reader>; asks: Model<Ask> };

/**
 * 이번 달 사용량. 독자 문서에 적힌 것이 이번 달 것이면 그대로, 아니면(이 값이 생기기 전의
 * 독자이거나 달이 바뀌었으면) 이번 달 질문에서 한 번 세어 적는다.
 *
 * 질문에서 매번 세지 않고 독자에게 적는 이유 — 질문은 독자가 지울 수 있다. 지운 질문의
 * 비용이 몫에서 빠지면 묻고 지우기를 되풀이해 한도를 피할 수 있다. 독자에게 적힌 값은
 * 질문을 지워도 줄지 않는다. 달이 바뀌면 0으로 되돌리지 않고 새 달을 다시 셀 뿐이다.
 */
export async function readUsage(
  { readers, asks }: Models,
  readerId: Types.ObjectId,
  now: Date,
): Promise<AskUsage> {
  const reader = await readers.findById(readerId).select('askUsage');
  const month = monthKey(now);
  if (reader?.askUsage?.month === month) {
    return { spent: reader.askUsage.spent, batches: reader.askUsage.batches };
  }
  return seed({ readers, asks }, readerId, now);
}

/**
 * 답을 받은 만큼 더한다. 질문을 저장한 **뒤에** 부른다 — 이번 달 값이 아직 없으면 질문에서
 * 세어 채우는데, 방금 저장한 질문이 그 셈에 들어가 따로 더하지 않아도 된다.
 *
 * 같은 독자의 두 묶음이 달이 바뀐 직후 동시에 답을 받으면 한 번이 두 번 세어질 수 있다.
 * 모자라게가 아니라 넉넉하게 세는 쪽이라 한도가 새지는 않는다.
 */
export async function addUsage(
  { readers, asks }: Models,
  readerId: Types.ObjectId,
  add: AskUsage,
  now: Date,
): Promise<void> {
  if (add.spent <= 0 && add.batches <= 0) return;
  const { matchedCount } = await readers.updateOne(
    { _id: readerId, 'askUsage.month': monthKey(now) },
    { $inc: { 'askUsage.spent': add.spent, 'askUsage.batches': add.batches } },
  );
  if (!matchedCount) await seed({ readers, asks }, readerId, now);
}

/**
 * 이번 달 질문의 비용을 세어 독자에게 적는다. 묶음별로 모아 묶음 하나를 한 번으로 센다 —
 * 남은 횟수의 어림값은 '한 번 물을 때 평균 얼마'로 내야 해서다. 비용이 적히기 전에 답한
 * 질문은 0으로 센다. 이미 이번 달 값이 있으면 덮지 않는다(먼저 적은 쪽이 이긴다).
 */
async function seed(
  { readers, asks }: Models,
  readerId: Types.ObjectId,
  now: Date,
): Promise<AskUsage> {
  const month = monthKey(now);
  const [counted] = await asks.aggregate<{ spent: number; batches: number }>([
    {
      $match: {
        readerId,
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
    { $group: { _id: null, spent: { $sum: '$cost' }, batches: { $sum: 1 } } },
  ]);
  const usage = {
    spent: counted?.spent ?? 0,
    batches: counted?.batches ?? 0,
  };

  const { modifiedCount } = await readers.updateOne(
    { _id: readerId, 'askUsage.month': { $ne: month } },
    { $set: { askUsage: { month, ...usage } } },
  );
  if (modifiedCount) return usage;

  /** 다른 요청이 먼저 적었다 — 그 값을 읽는다 */
  const reader = await readers.findById(readerId).select('askUsage');
  return reader?.askUsage?.month === month
    ? { spent: reader.askUsage.spent, batches: reader.askUsage.batches }
    : usage;
}

export function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
