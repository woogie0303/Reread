import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SentencesService } from './sentences.service';

describe('SentencesService.create — 익명 독자의 문장 수', () => {
  const readerId = new Types.ObjectId().toString();
  const bookId = new Types.ObjectId().toString();
  let sentences: { create: jest.Mock; countDocuments: jest.Mock };
  let books: { findOne: jest.Mock };
  let asks: { distinct: jest.Mock };
  let readers: { findById: jest.Mock };
  let limit: string | undefined;
  let service: SentencesService;

  const reader = (accounts: unknown[]) =>
    readers.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ accounts }),
    });

  beforeEach(() => {
    limit = undefined;
    sentences = {
      create: jest.fn((doc: object) => ({ ...doc })),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    books = { findOne: jest.fn().mockResolvedValue({ pages: 300 }) };
    asks = { distinct: jest.fn().mockResolvedValue([]) };
    readers = { findById: jest.fn() };
    service = new SentencesService(
      sentences as never,
      books as never,
      {} as never,
      asks as never,
      readers as never,
      { get: () => limit } as never,
    );
  });

  const dto = { bookId, text: 'A line I loved.', page: 12 };

  it('익명 독자가 5개를 채웠으면 6번째는 거절하고 로그인을 권한다', async () => {
    reader([]);
    sentences.countDocuments.mockResolvedValue(5);

    await expect(service.create(readerId, dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(sentences.create).not.toHaveBeenCalled();
  });

  it('5개 미만이면 담는다', async () => {
    reader([]);
    sentences.countDocuments.mockResolvedValue(4);

    await service.create(readerId, dto);

    expect(sentences.create).toHaveBeenCalled();
  });

  it('물어본 문장은 세지 않는다', async () => {
    reader([]);
    const asked = [new Types.ObjectId()];
    asks.distinct.mockResolvedValue(asked);

    await service.create(readerId, dto);

    expect(sentences.countDocuments).toHaveBeenCalledWith({
      readerId: new Types.ObjectId(readerId),
      _id: { $nin: asked },
    });
  });

  it('로그인한 독자는 몇 개든 담는다', async () => {
    reader([{ provider: 'kakao' }]);
    sentences.countDocuments.mockResolvedValue(500);

    await service.create(readerId, dto);

    expect(sentences.create).toHaveBeenCalled();
    expect(sentences.countDocuments).not.toHaveBeenCalled();
  });

  it('상한은 ANON_SENTENCE_LIMIT으로 바꾼다', async () => {
    reader([]);
    limit = '2';
    sentences.countDocuments.mockResolvedValue(2);

    await expect(service.create(readerId, dto)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
