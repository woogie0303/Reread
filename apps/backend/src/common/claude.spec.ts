import { Logger } from '@nestjs/common';
import { costOf } from './claude';

describe('costOf', () => {
  const log = { warn: jest.fn() } as unknown as Logger;

  it('입력·출력·캐시 토큰을 Haiku 가격으로 매긴다', () => {
    const cost = costOf(
      'claude-haiku-4-5-20251001',
      {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      },
      log,
    );
    expect(cost).toBeCloseTo(1 + 5 + 1.25 + 0.1);
  });

  it('질문 한 번은 1센트 안팎이다', () => {
    const cost = costOf(
      'claude-haiku-4-5-20251001',
      { input_tokens: 4500, output_tokens: 1500 },
      log,
    );
    expect(cost).toBeCloseTo(0.012);
  });

  it('모르는 모델은 Haiku 값으로 매기고 로그에 남긴다', () => {
    const cost = costOf(
      'claude-unknown',
      { input_tokens: 1_000_000, output_tokens: 0 },
      log,
    );
    expect(cost).toBeCloseTo(1);
    expect(log.warn).toHaveBeenCalled();
  });
});
