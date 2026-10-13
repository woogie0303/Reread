import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ItemsService } from './items.service';

const reader = new Types.ObjectId();
const id = () => new Types.ObjectId();

type Enc = { sentenceId: Types.ObjectId };
type FakeItem = {
  _id: Types.ObjectId;
  encounters: Enc[];
  save: jest.Mock;
};
type FakeSentence = {
  _id: Types.ObjectId;
  favorite: boolean;
  thoughts: unknown[];
};
type FakeAsk = { sentenceId: Types.ObjectId; status: 'answered' | 'pending' };

/**
 * 표현·문장·질문을 메모리에 두는 가짜 모델. 서비스가 부르는 질의만 흉내 낸다 — 무엇을
 * 지우고 무엇을 남기는지가 이 테스트의 전부다.
 */
function build(setup: {
  items: FakeItem[];
  sentences: FakeSentence[];
  asks: FakeAsk[];
}) {
  const state = {
    items: [...setup.items],
    sentences: [...setup.sentences],
    asks: [...setup.asks],
  };
  const eq = (a: Types.ObjectId, b: Types.ObjectId) => a.equals(b);

  const items = {
    findOne: jest.fn(({ _id }: { _id: Types.ObjectId }) =>
      Promise.resolve(state.items.find((i) => eq(i._id, _id)) ?? null),
    ),
    deleteOne: jest.fn(({ _id }: { _id: Types.ObjectId }) => {
      state.items = state.items.filter((i) => !eq(i._id, _id));
      return Promise.resolve();
    }),
    exists: jest.fn((filter: Record<string, Types.ObjectId>) => {
      const target = filter['encounters.sentenceId'];
      return Promise.resolve(
        state.items.some((i) =>
          i.encounters.some((e) => eq(e.sentenceId, target)),
        )
          ? { _id: id() }
          : null,
      );
    }),
  };
  const sentences = {
    findOne: jest.fn(({ _id }: { _id: Types.ObjectId }) =>
      Promise.resolve(state.sentences.find((s) => eq(s._id, _id)) ?? null),
    ),
    updateOne: jest.fn(
      ({ _id }: { _id: Types.ObjectId }, patch: Partial<FakeSentence>) => {
        const found = state.sentences.find((s) => eq(s._id, _id));
        if (found) Object.assign(found, patch);
        return Promise.resolve();
      },
    ),
    deleteOne: jest.fn(({ _id }: { _id: Types.ObjectId }) => {
      state.sentences = state.sentences.filter((s) => !eq(s._id, _id));
      return Promise.resolve();
    }),
  };
  const asks = {
    find: jest.fn(({ sentenceId }: { sentenceId: Types.ObjectId }) =>
      Promise.resolve(state.asks.filter((a) => eq(a.sentenceId, sentenceId))),
    ),
    deleteMany: jest.fn(({ sentenceId }: { sentenceId: Types.ObjectId }) => {
      state.asks = state.asks.filter((a) => !eq(a.sentenceId, sentenceId));
      return Promise.resolve();
    }),
  };

  /** `find`가 서비스 안에서 `findOne({ _id, readerId })`로 부르는 것을 그대로 쓴다 */
  const service = new ItemsService(
    items as never,
    sentences as never,
    {} as never,
    asks as never,
  );
  return { service, state };
}

function item(...sentenceIds: Types.ObjectId[]): FakeItem {
  return {
    _id: id(),
    encounters: sentenceIds.map((sentenceId) => ({ sentenceId })),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

const sentence = (over: Partial<FakeSentence> = {}): FakeSentence => ({
  _id: id(),
  favorite: false,
  thoughts: [],
  ...over,
});

describe('ItemsService.removeEncounters', () => {
  it('고른 문장에서만 빼고, 다른 문장의 만남은 남긴다', async () => {
    const a = sentence();
    const b = sentence();
    const make = item(a._id, b._id);
    const other = item(a._id);
    const { service, state } = build({
      items: [make, other],
      sentences: [a, b],
      asks: [
        { sentenceId: a._id, status: 'answered' },
        { sentenceId: b._id, status: 'answered' },
      ],
    });

    const result = await service.removeEncounters(
      reader.toString(),
      make._id.toString(),
      [b._id.toString()],
    );

    expect(result.removed).toBe('encounter');
    expect(make.encounters.map((e) => e.sentenceId)).toEqual([a._id]);
    /** b에는 이제 담은 표현이 없다 — 보이지 않게 남기지 않고 문장과 질문을 함께 지운다 */
    expect(result.sentencesRemoved).toBe(1);
    expect(state.sentences.map((s) => s._id)).toEqual([a._id]);
    expect(state.asks.every((ask) => ask.sentenceId.equals(a._id))).toBe(true);
  });

  it('다른 표현이 아직 그 문장을 만났으면 문장을 지우지 않는다', async () => {
    const a = sentence();
    const make = item(a._id);
    const other = item(a._id);
    const { service, state } = build({
      items: [make, other],
      sentences: [a],
      asks: [{ sentenceId: a._id, status: 'answered' }],
    });

    const result = await service.removeEncounters(
      reader.toString(),
      make._id.toString(),
      [a._id.toString()],
    );

    expect(result.removed).toBe('item');
    expect(result.sentencesRemoved).toBe(0);
    expect(state.sentences).toHaveLength(1);
  });

  it('모든 만남을 빼면 표현도 사라진다', async () => {
    const a = sentence();
    const b = sentence();
    const make = item(a._id, b._id);
    const { service, state } = build({
      items: [make],
      sentences: [a, b],
      asks: [
        { sentenceId: a._id, status: 'answered' },
        { sentenceId: b._id, status: 'answered' },
      ],
    });

    const result = await service.removeEncounters(
      reader.toString(),
      make._id.toString(),
      [a._id.toString(), b._id.toString()],
    );

    expect(result.removed).toBe('item');
    expect(state.items).toHaveLength(0);
    expect(result.sentencesRemoved).toBe(2);
  });

  it('하트를 켠 문장은 남긴다', async () => {
    const a = sentence({ favorite: true });
    const make = item(a._id);
    const { service, state } = build({
      items: [make],
      sentences: [a],
      asks: [{ sentenceId: a._id, status: 'answered' }],
    });

    const result = await service.removeEncounters(
      reader.toString(),
      make._id.toString(),
      [a._id.toString()],
    );

    expect(result.sentencesRemoved).toBe(0);
    expect(state.sentences).toHaveLength(1);
  });

  it('묻지 않고 담아둔 문장은 남긴다 — 원래 마음에 든 문장이다', async () => {
    const a = sentence();
    const make = item(a._id);
    const { service, state } = build({
      items: [make],
      sentences: [a],
      asks: [],
    });

    const result = await service.removeEncounters(
      reader.toString(),
      make._id.toString(),
      [a._id.toString()],
    );

    expect(result.sentencesRemoved).toBe(0);
    expect(state.sentences).toHaveLength(1);
  });

  it('답을 기다리는 질문이 있는 문장은 남긴다', async () => {
    const a = sentence();
    const make = item(a._id);
    const { service, state } = build({
      items: [make],
      sentences: [a],
      asks: [{ sentenceId: a._id, status: 'pending' }],
    });

    const result = await service.removeEncounters(
      reader.toString(),
      make._id.toString(),
      [a._id.toString()],
    );

    expect(result.sentencesRemoved).toBe(0);
    expect(state.sentences).toHaveLength(1);
  });

  it('내 생각을 달아둔 문장은 지우지 않고 마음에 든 문장으로 남긴다', async () => {
    const a = sentence({ thoughts: [{ text: '이 장면이 좋았다' }] });
    const make = item(a._id);
    const { service, state } = build({
      items: [make],
      sentences: [a],
      asks: [{ sentenceId: a._id, status: 'answered' }],
    });

    const result = await service.removeEncounters(
      reader.toString(),
      make._id.toString(),
      [a._id.toString()],
    );

    expect(result.sentencesRemoved).toBe(0);
    expect(state.sentences[0].favorite).toBe(true);
    expect(state.asks).toHaveLength(1);
  });

  it('이 표현이 만난 적 없는 문장만 주면 찾지 못했다고 한다', async () => {
    const a = sentence();
    const make = item(a._id);
    const { service } = build({
      items: [make],
      sentences: [a],
      asks: [{ sentenceId: a._id, status: 'answered' }],
    });

    await expect(
      service.removeEncounters(reader.toString(), make._id.toString(), [
        id().toString(),
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ItemsService.save — 같은 문장에서 다시 담을 때', () => {
  /** 이미 이 문장에서 만난 표현을 다시 담는 상황만 만든다 */
  function setup(surface: string) {
    const target = id();
    const existing = {
      _id: id(),
      encounters: [{ sentenceId: target, surface, savedAt: new Date() }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const items = { findOne: jest.fn().mockResolvedValue(existing) };
    const sentences = {
      findOne: jest.fn().mockResolvedValue({ _id: target }),
    };
    const service = new ItemsService(
      items as never,
      sentences as never,
      {} as never,
      {} as never,
    );
    return { service, existing, target };
  }

  it('고른 글자가 달라졌으면 만남에 적힌 글자를 새로 고른 것으로 바꾼다', async () => {
    const { service, existing, target } = setup('pa');

    const result = await service.save(reader.toString(), {
      sentenceId: target.toString(),
      term: 'patronizing',
      meaning: '가르치려 드는',
      surface: 'patronizing',
    });

    expect(result.reencountered).toBe(false);
    expect(existing.encounters[0].surface).toBe('patronizing');
    expect(existing.save).toHaveBeenCalledTimes(1);
  });

  it('글자가 같으면 아무것도 쓰지 않는다', async () => {
    const { service, existing, target } = setup('patronizing');

    await service.save(reader.toString(), {
      sentenceId: target.toString(),
      term: 'patronizing',
      meaning: '가르치려 드는',
      surface: 'patronizing',
    });

    expect(existing.save).not.toHaveBeenCalled();
  });
});
