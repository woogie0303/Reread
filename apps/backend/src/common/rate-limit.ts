import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { AccessPayload } from './jwt-auth.guard';

/**
 * 호출 횟수 제한. 요청 한 번이 아니라 **짧은 시간에 몰리는 것**을 막는다 — 총량은 따로
 * 막고 있다(월 사용량 한도 `ASK_MONTHLY_BUDGET_USD`). 둘의 역할이 달라서 숫자를 서로 맞추려
 * 들지 않는다.
 *
 * 숫자는 앱이 정상으로 부르는 양보다 한참 넉넉하게 잡았다. 한 화면이 한꺼번에 부르는 건
 * 많아야 대여섯 건이고, 제한에 걸린 독자가 겪는 일은 '앱이 이유 없이 안 된다'라서 막는
 * 쪽보다 잘못 막는 쪽이 더 비싸다.
 */
export const RATE_LIMIT = {
  /** 모든 길의 바닥 */
  default: { limit: 120, ttl: 60_000 },
  /** 모델을 부르는 길 — 부를 때마다 돈이 든다. 월 한도가 총량을, 이건 순간 폭주를 막는다 */
  model: { limit: 10, ttl: 60_000 },
  /** 로그인 쪽 — 토큰이나 티켓을 맞춰보는 시도를 막는다. 로그인 전이라 IP로 센다 */
  auth: { limit: 20, ttl: 60_000 },
  /** 외부 검색 — Open Library는 서버 전체에 초당 한 건만 받아준다 */
  search: { limit: 30, ttl: 60_000 },
  /**
   * 익명 독자 만들기 — 독자마다 질문 몫이 생겨서 마구 만들면 그만큼 모델 비용이 열린다.
   * 앱을 처음 열 때 한 번이라 한 시간에 몇 번이면 넉넉하다. 통신사 망은 여러 사람이
   * 한 IP를 나눠 쓰니 너무 조이지는 않는다.
   */
  anonymous: { limit: 10, ttl: 60 * 60_000 },
} as const;

export const RATE_LIMIT_MESSAGE =
  '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';

export function rateLimitOptions(
  base: { limit: number; ttl: number } = RATE_LIMIT.default,
): ThrottlerModuleOptions {
  return {
    throttlers: [{ name: 'default', ...base }],
    errorMessage: RATE_LIMIT_MESSAGE,
  };
}

/**
 * 프록시를 몇 단 믿을지. **틀리면 조용히 망가지는** 값이라 따로 뺐다.
 *
 * 호스팅(Render 등)은 서버 앞에 프록시를 두어서, 설정을 안 하면 모든 요청의 IP가
 * 프록시 하나로 보인다 — 로그인 전 요청이 전부 한 통에 담겨서 한도가 사람이 아니라
 * 서버 전체에 걸린다. 반대로 프록시가 없는데 믿는다고 하면 `X-Forwarded-For`를 마음대로
 * 적어 보내는 것으로 한도를 피할 수 있다.
 *
 * 그래서 숫자(단 수)로만 받고, `TRUST_PROXY`가 없으면 운영은 1단, 개발은 0단이다.
 * 로그인한 독자는 IP가 아니라 독자 id로 세므로(`RateLimitGuard`) 이 값이 틀려도
 * 로그인 뒤의 길은 영향을 받지 않는다.
 */
export function trustProxyHops(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.TRUST_PROXY?.trim();
  if (raw) {
    const hops = Number(raw);
    if (!Number.isInteger(hops) || hops < 0) {
      throw new Error(
        `TRUST_PROXY는 0 이상의 정수(프록시 단 수)여야 해요: "${raw}"`,
      );
    }
    return hops;
  }
  return env.NODE_ENV === 'production' ? 1 : 0;
}

/**
 * 누구의 호출로 셀지 정한다 — **서명이 맞는 토큰의 독자**면 독자로, 아니면 IP로.
 *
 * IP만으로 세면 두 가지가 어긋난다. 통신사 망은 여러 사람이 한 IP를 나눠 쓰고(그 사람들이
 * 한 통을 같이 쓰게 된다), 프록시 설정이 틀리면 모두가 한 IP가 된다. 로그인한 호출은
 * 독자로 세면 둘 다 피한다.
 *
 * 토큰은 **검증한 뒤에만** 믿는다. 검증 없이 `sub`를 읽으면 아무 값이나 지어 보내서
 * 호출마다 새 통을 만들 수 있다 — 한도를 피하는 가장 쉬운 길이다. 검증이 안 되는
 * 토큰은 없는 것과 같이 IP로 센다.
 *
 * 이 가드는 전역이라 `JwtAuthGuard`보다 먼저 돈다(그래서 `request.readerId`를 못 쓴다).
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headers = req.headers as { authorization?: string } | undefined;
    const [scheme, token] = (headers?.authorization ?? '').split(' ');

    if (scheme === 'Bearer' && token) {
      try {
        const { sub } = await this.jwt.verifyAsync<AccessPayload>(token);
        if (sub) return `reader:${sub}`;
      } catch {
        /* 서명이 틀렸거나 만료 — 로그인 안 한 호출과 같이 IP로 센다 */
      }
    }
    return `ip:${await super.getTracker(req)}`;
  }
}
