import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ANTHROPIC_DEFAULT_MODEL, AnthropicModel } from './anthropic.model';
import { CLOUDFLARE_DEFAULT_MODEL, CloudflareModel } from './cloudflare.model';
import { createAskModel } from './model.factory';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('createAskModel', () => {
  let error: jest.SpyInstance;
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('정하지 않으면 Cloudflare다', () => {
    expect(createAskModel(config({}))).toBeInstanceOf(CloudflareModel);
  });

  it('ASK_PROVIDER로 공급자를 고른다', () => {
    expect(
      createAskModel(config({ ASK_PROVIDER: 'anthropic' })),
    ).toBeInstanceOf(AnthropicModel);
    expect(
      createAskModel(config({ ASK_PROVIDER: 'cloudflare' })),
    ).toBeInstanceOf(CloudflareModel);
  });

  it('모르는 이름이면 부팅을 막지 않고 기본 공급자로 돌아간다', () => {
    expect(createAskModel(config({ ASK_PROVIDER: 'nope' }))).toBeInstanceOf(
      CloudflareModel,
    );
    expect(error).toHaveBeenCalled();
  });

  it('ASK_MODEL이 그 공급자의 모델을 정한다', () => {
    expect(
      createAskModel(
        config({ ASK_PROVIDER: 'anthropic', ASK_MODEL: 'claude-test' }),
      ).modelName,
    ).toBe('claude-test');
    expect(
      createAskModel(config({ ASK_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8' }))
        .modelName,
    ).toBe('@cf/qwen/qwen3-30b-a3b-fp8');
  });

  it('공급자를 바꾸고 남은 예전 ASK_MODEL은 무시한다', () => {
    /** 예: Haiku에서 Cloudflare로 옮겼는데 ASK_MODEL=claude-…가 남은 환경 */
    expect(
      createAskModel(config({ ASK_MODEL: 'claude-haiku-4-5-20251001' }))
        .modelName,
    ).toBe(CLOUDFLARE_DEFAULT_MODEL);
    expect(
      createAskModel(
        config({ ASK_PROVIDER: 'anthropic', ASK_MODEL: '@cf/google/gemma' }),
      ).modelName,
    ).toBe(ANTHROPIC_DEFAULT_MODEL);
  });
});
