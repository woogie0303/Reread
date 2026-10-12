import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AskModel } from './ask-model';
import { AnthropicModel } from './anthropic.model';
import { CloudflareModel } from './cloudflare.model';

/**
 * 질문에 답하는 모델을 고른다. `ASK_PROVIDER`가 공급자를, `ASK_MODEL`이 그 공급자의 모델을
 * 정한다. 새 모델은 `AskModel`을 구현한 파일 하나를 더하고 여기 한 줄을 등록하면 된다.
 *
 * 모르는 이름이면 부팅을 막지 않는다 — 질문이 대기로 남을 뿐 담는 일은 되어야 한다(ADR-0003).
 * 그래서 로그만 남기고 기본 공급자로 돌아간다.
 */
const PROVIDERS: Record<string, (config: ConfigService) => AskModel> = {
  cloudflare: (config) => new CloudflareModel(config),
  anthropic: (config) => new AnthropicModel(config),
};

export const DEFAULT_PROVIDER = 'cloudflare';

export function createAskModel(config: ConfigService): AskModel {
  const log = new Logger('AskModel');
  const asked = config.get<string>('ASK_PROVIDER') ?? DEFAULT_PROVIDER;
  const known = Object.hasOwn(PROVIDERS, asked);
  const provider = known ? asked : DEFAULT_PROVIDER;
  if (!known)
    log.error(
      `ASK_PROVIDER=${asked}를 모릅니다(${Object.keys(PROVIDERS).join('|')}). ${DEFAULT_PROVIDER}로 돌아갑니다.`,
    );

  const model = PROVIDERS[provider](config);
  log.log(`질문 모델: ${provider} / ${model.modelName}`);
  return model;
}
