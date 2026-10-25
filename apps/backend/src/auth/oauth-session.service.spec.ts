import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { createHash, createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { OAuthSessionService } from './oauth-session.service';

/**
 * 진짜 `@nestjs/jwt`(안이 `jsonwebtoken`을 ESM으로 물고 와서 이 저장소의 ts-jest
 * 설정과 부딪힌다 — 이 테스트가 이 백엔드의 첫 테스트라 지금까지 드러난 적이
 * 없었다)를 붙이는 대신, 같은 모양(signAsync/verifyAsync)의 최소 구현을 쓴다.
 * HMAC 서명이라 위조·만료를 실제로 검증한다 — OAuthSessionService 쪽 로직은
 * 진짜 그대로 시험된다.
 */
class FakeJwtService {
  constructor(private readonly secret: string) {}

  signAsync(payload: object, opts?: { expiresIn?: string }): Promise<string> {
    const body = { ...payload, exp: Date.now() + ttlMs(opts?.expiresIn) };
    const json = Buffer.from(JSON.stringify(body)).toString('base64url');
    const sig = createHmac('sha256', this.secret)
      .update(json)
      .digest('base64url');
    return Promise.resolve(`${json}.${sig}`);
  }

  verifyAsync<T>(token: string): Promise<T> {
    const [json, sig] = token.split('.');
    if (!json || !sig) return Promise.reject(new Error('malformed'));
    const expected = createHmac('sha256', this.secret)
      .update(json)
      .digest('base64url');
    if (sig !== expected) return Promise.reject(new Error('bad signature'));
    const body = JSON.parse(
      Buffer.from(json, 'base64url').toString('utf8'),
    ) as {
      exp: number;
    };
    if (body.exp < Date.now()) return Promise.reject(new Error('expired'));
    return Promise.resolve(body as T);
  }
}

function ttlMs(expiresIn = '15m'): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) return 15 * 60 * 1000;
  const unit: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(match[1]) * unit[match[2]];
}

/**
 * `./oauth`(PROVIDERS)를 가짜로 바꾼다 — 진짜 kakao/naver/google은 네트워크로
 * 나가므로, 서버가 짓는 URL과 서버가 하는 검증(state·ticket·returnUrl)만
 * 시험한다. 제공자 응답 파싱 자체는 각 provider 파일이 이미 다룬다.
 */
jest.mock('./oauth', () => ({
  PROVIDERS: {
    kakao: {
      name: 'kakao',
      authorizeUrl: ({
        redirectUri,
        state,
      }: {
        redirectUri: string;
        state: string;
      }) =>
        `https://kauth.kakao.com/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
      exchange: jest.fn(),
    },
    naver: { name: 'naver', authorizeUrl: undefined, exchange: jest.fn() },
    google: { name: 'google', authorizeUrl: undefined, exchange: jest.fn() },
    apple: { name: 'apple', exchange: jest.fn() },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PROVIDERS } = require('./oauth') as {
  PROVIDERS: Record<string, { exchange: jest.Mock }>;
};

function challengeFrom(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

describe('OAuthSessionService', () => {
  const readerId = new Types.ObjectId().toString();
  let jwt: JwtService;
  let config: { get: jest.Mock };
  let auth: {
    configFor: jest.Mock;
    findOrCreate: jest.Mock;
    enter: jest.Mock;
  };
  let tickets: { create: jest.Mock; findOneAndDelete: jest.Mock };
  let service: OAuthSessionService;

  beforeEach(() => {
    jwt = new FakeJwtService('test-secret') as unknown as JwtService;
    config = {
      get: jest.fn((key: string) => {
        if (key === 'OAUTH_RETURN_URL_SCHEMES') return 'reread://,exp://';
        if (key === 'PUBLIC_BASE_URL') return 'https://api.example.com';
        return undefined;
      }),
    };
    auth = {
      configFor: jest.fn(() => ({ clientId: 'id', clientSecret: 'secret' })),
      findOrCreate: jest.fn(() => ({ id: readerId })),
      enter: jest.fn((id: string) => ({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
        reader: {
          id,
          nickname: '독자',
          providers: ['kakao'],
          anonymous: false,
        },
      })),
    };
    tickets = { create: jest.fn(), findOneAndDelete: jest.fn() };

    service = new OAuthSessionService(
      jwt,
      config as unknown as ConfigService,
      auth as never,
      tickets as never,
    );

    PROVIDERS.kakao.exchange.mockReset();
  });

  describe('returnUrl 허용 목록', () => {
    it('허용된 스킴이면 동의 화면 URL을 짓는다', async () => {
      const url = await service.authorizeUrl('kakao', {
        challenge: 'x'.repeat(43),
        returnUrl: 'reread://auth',
      });
      expect(url).toContain('kauth.kakao.com');
    });

    it('허용되지 않은 스킴이면 400으로 막는다', async () => {
      await expect(
        service.authorizeUrl('kakao', {
          challenge: 'x'.repeat(43),
          returnUrl: 'https://evil.example.com/auth',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('브라우저 동의 화면이 없는 제공자(Apple)는 400으로 막는다', async () => {
      await expect(
        service.authorizeUrl('apple', {
          challenge: 'x'.repeat(43),
          returnUrl: 'reread://auth',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('state', () => {
    it('위조되거나 우리가 서명하지 않은 state는 처리하지 않고 400으로 막는다', async () => {
      await expect(
        service.finish('kakao', {
          code: 'abc',
          state: '이건-우리가-만든-토큰이-아니다',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('다른 provider의 state를 가져오면 400으로 막는다', async () => {
      const state = await jwt.signAsync({
        provider: 'naver',
        challenge: 'x'.repeat(43),
        returnUrl: 'reread://auth',
      });
      await expect(
        service.finish('kakao', { code: 'abc', state }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('provider가 error를 실어 돌려주면 returnUrl로 error를 담아 되돌린다', async () => {
      const state = await jwt.signAsync({
        provider: 'kakao',
        challenge: 'x'.repeat(43),
        returnUrl: 'reread://auth',
      });
      const url = await service.finish('kakao', {
        error: 'access_denied',
        state,
      });
      expect(url).toBe('reread://auth?error=access_denied');
    });
  });

  describe('로그인 성공 흐름 → 티켓 발급', () => {
    it('exchange가 성공하면 독자를 찾거나 만들고, returnUrl에 ticket·state를 실어 돌려준다', async () => {
      const state = await jwt.signAsync({
        provider: 'kakao',
        challenge: 'x'.repeat(43),
        returnUrl: 'reread://auth',
      });
      PROVIDERS.kakao.exchange.mockResolvedValue({
        providerId: '1',
        nickname: '독자',
      });
      tickets.create.mockResolvedValue({ id: 'ticket-id-1' });

      const url = await service.finish('kakao', { code: 'good-code', state });

      expect(auth.findOrCreate).toHaveBeenCalledWith('kakao', {
        providerId: '1',
        nickname: '독자',
      });
      expect(tickets.create).toHaveBeenCalledWith(
        expect.objectContaining({ readerId, challenge: 'x'.repeat(43) }),
      );
      expect(url).toBe(`reread://auth?ticket=ticket-id-1&state=${state}`);
    });

    it('exchange가 실패해도 (신뢰할 수 있는) returnUrl로 error를 담아 되돌린다', async () => {
      const state = await jwt.signAsync({
        provider: 'kakao',
        challenge: 'x'.repeat(43),
        returnUrl: 'reread://auth',
      });
      PROVIDERS.kakao.exchange.mockRejectedValue(
        new Error('카카오가 거절했어요.'),
      );

      const url = await service.finish('kakao', { code: 'bad-code', state });
      expect(url).toBe(
        'reread://auth?error=%EC%B9%B4%EC%B9%B4%EC%98%A4%EA%B0%80+%EA%B1%B0%EC%A0%88%ED%96%88%EC%96%B4%EC%9A%94.',
      );
    });
  });

  describe('redeem — 티켓 교환', () => {
    const verifier = 'a'.repeat(50);

    it('올바른 code_verifier면 토큰을 내준다', async () => {
      tickets.findOneAndDelete.mockResolvedValue({
        readerId: { toString: () => readerId },
        challenge: challengeFrom(verifier),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.redeem(
        new Types.ObjectId().toString(),
        verifier,
      );

      expect(auth.enter).toHaveBeenCalledWith(readerId, undefined);
      expect(result.reader.id).toBe(readerId);
    });

    it('익명 독자가 함께 왔으면 그 독자를 넘겨 기록을 옮기게 한다', async () => {
      const anonymousId = new Types.ObjectId().toString();
      tickets.findOneAndDelete.mockResolvedValue({
        readerId: { toString: () => readerId },
        challenge: challengeFrom(verifier),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.redeem(
        new Types.ObjectId().toString(),
        verifier,
        anonymousId,
      );

      expect(auth.enter).toHaveBeenCalledWith(readerId, anonymousId);
    });

    it('code_verifier가 challenge와 맞지 않으면 거절한다', async () => {
      tickets.findOneAndDelete.mockResolvedValue({
        readerId: { toString: () => readerId },
        challenge: challengeFrom('다른-verifier'),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.redeem(new Types.ObjectId().toString(), verifier),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('티켓이 없으면(이미 썼거나 애초에 없으면) 거절한다', async () => {
      tickets.findOneAndDelete.mockResolvedValue(null);

      await expect(
        service.redeem(new Types.ObjectId().toString(), verifier),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('만료된 티켓은 거절한다', async () => {
      tickets.findOneAndDelete.mockResolvedValue({
        readerId: { toString: () => readerId },
        challenge: challengeFrom(verifier),
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(
        service.redeem(new Types.ObjectId().toString(), verifier),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('ObjectId 모양이 아닌 티켓은 DB를 보지도 않고 거절한다', async () => {
      await expect(
        service.redeem('not-an-object-id', verifier),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tickets.findOneAndDelete).not.toHaveBeenCalled();
    });
  });
});
