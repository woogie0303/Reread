import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';
import type { ProviderName } from '../readers/reader.schema';
import { AuthService, type SignInResult } from './auth.service';
import { PROVIDERS } from './oauth';
import { OAuthTicket } from './schemas/oauth-ticket.schema';

type StateClaims = {
  provider: ProviderName;
  challenge: string;
  returnUrl: string;
};

/** 동의 화면에서 오래 머물 수 있으니 넉넉히 — 하지만 무기한은 아니다 */
const STATE_TTL = '10m';
/** 앱이 돌아오자마자 바로 교환한다 — 길게 살려 둘 이유가 없다 */
const TICKET_TTL_MS = 60 * 1000;

/**
 * 카카오·네이버·구글의 "브라우저 동의 화면 + 서버 콜백" 로그인.
 *
 * 앱은 서버가 만든 딥링크로 돌아오고, 그 안엔 액세스 토큰이 아니라 **1회용
 * 티켓**만 있다. 토큰을 딥링크에 실으면 기기의 다른 앱이나 브라우저
 * 히스토리에 남을 수 있어서다. 진짜 토큰은 앱이 티켓과 자기만 아는
 * PKCE code_verifier를 들고 `/auth/exchange`로 와야 받는다.
 *
 * state는 무작위 값을 저장해 두는 대신 **서명해서** 돌려받는다(JwtService) —
 * provider가 그대로 돌려주기만 하면 되는 값이라, DB에 넣고 매번 찾아보는
 * 대신 서명 하나로 위조 여부를 확인한다. challenge와 returnUrl을 그 안에
 * 실어 보내서, 콜백이 받을 때 DB 조회 없이 그대로 꺼내 쓴다.
 */
@Injectable()
export class OAuthSessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    @InjectModel(OAuthTicket.name)
    private readonly tickets: Model<OAuthTicket>,
  ) {}

  /** `GET /auth/:provider/start` — provider의 동의 화면 URL을 짓는다 */
  async authorizeUrl(
    provider: ProviderName,
    input: { challenge: string; returnUrl: string },
  ): Promise<string> {
    const impl = PROVIDERS[provider];
    if (!impl.authorizeUrl) {
      throw new BadRequestException(
        `${provider}은(는) 브라우저로 로그인하지 않아요.`,
      );
    }
    this.assertAllowedReturnUrl(input.returnUrl);

    const state = await this.jwt.signAsync(
      {
        provider,
        challenge: input.challenge,
        returnUrl: input.returnUrl,
      } satisfies StateClaims,
      { expiresIn: STATE_TTL },
    );

    return impl.authorizeUrl(
      { redirectUri: this.callbackUrl(provider), state },
      this.auth.configFor(provider),
    );
  }

  /**
   * `GET /auth/:provider/callback` — 다음에 돌아갈 주소를 짓는다.
   *
   * 성공하면 `returnUrl?ticket=…&state=…`, 실패하면 `returnUrl?error=…`다.
   * state 자체가 위조·만료됐으면(우리가 서명한 게 아니면) 믿을 수 있는
   * returnUrl이 없다는 뜻이라 리다이렉트하지 않고 그냥 막는다.
   */
  async finish(
    provider: ProviderName,
    input: { code?: string; error?: string; state: string },
  ): Promise<string> {
    const claims = await this.verifyState(provider, input.state);

    if (input.error || !input.code) {
      return this.errorRedirect(
        claims.returnUrl,
        input.error ?? '동의하지 않았어요.',
      );
    }

    try {
      const impl = PROVIDERS[provider];
      const config = this.auth.configFor(provider);
      const profile = await impl.exchange(
        {
          code: input.code,
          redirectUri: this.callbackUrl(provider),
          state: input.state,
        },
        config,
      );
      const reader = await this.auth.findOrCreate(provider, profile);
      const ticket = await this.issueTicket(reader.id, claims.challenge);

      const url = new URL(claims.returnUrl);
      url.searchParams.set('ticket', ticket);
      url.searchParams.set('state', input.state);
      return url.toString();
    } catch (error) {
      return this.errorRedirect(
        claims.returnUrl,
        error instanceof Error ? error.message : '로그인에 실패했어요.',
      );
    }
  }

  /**
   * `POST /auth/exchange` — 딥링크로 받은 티켓을 진짜 토큰으로 바꾼다.
   *
   * SHA256(codeVerifier)가 티켓에 적힌 challenge와 같아야 한다. 다르면 이
   * 티켓을 들고 온 게 이 로그인을 시작한 기기가 아니라는 뜻이다. 찾자마자
   * 지운다 — 맞든 틀리든 한 번 쓰면 그걸로 끝이다.
   */
  async redeem(
    ticketId: string,
    codeVerifier: string,
    anonymousId?: string,
  ): Promise<SignInResult> {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw new UnauthorizedException(
        '로그인이 만료됐어요. 다시 시도해 주세요.',
      );
    }

    const ticket = await this.tickets.findOneAndDelete({ _id: ticketId });
    if (!ticket || ticket.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        '로그인이 만료됐어요. 다시 시도해 주세요.',
      );
    }
    if (challengeFrom(codeVerifier) !== ticket.challenge) {
      throw new UnauthorizedException('이 로그인을 시작한 기기가 아니에요.');
    }

    return this.auth.enter(ticket.readerId.toString(), anonymousId);
  }

  private async issueTicket(
    readerId: string,
    challenge: string,
  ): Promise<string> {
    const doc = await this.tickets.create({
      readerId,
      challenge,
      expiresAt: new Date(Date.now() + TICKET_TTL_MS),
    });
    return doc.id;
  }

  private async verifyState(
    provider: ProviderName,
    state: string,
  ): Promise<StateClaims> {
    try {
      const claims = await this.jwt.verifyAsync<StateClaims>(state);
      if (claims.provider !== provider) throw new Error('provider mismatch');
      return claims;
    } catch {
      throw new BadRequestException(
        '로그인 요청이 유효하지 않아요. 처음부터 다시 시도해 주세요.',
      );
    }
  }

  /**
   * open redirect 방지. 콤마로 나눈 스킴 접두사 목록(`OAUTH_RETURN_URL_SCHEMES`)과
   * 대조한다 — `exp://192.168.1.5:8081/--/auth`처럼 개발 중엔 호스트·포트가
   * 매번 바뀌어서 URL 전체를 등록해 둘 수 없다.
   */
  private assertAllowedReturnUrl(returnUrl: string): void {
    const schemes = (this.config.get<string>('OAUTH_RETURN_URL_SCHEMES') ?? '')
      .split(',')
      .map((scheme) => scheme.trim())
      .filter(Boolean);

    if (!schemes.some((scheme) => returnUrl.startsWith(scheme))) {
      throw new BadRequestException('허용되지 않은 returnUrl이에요.');
    }
  }

  private errorRedirect(returnUrl: string, message: string): string {
    const url = new URL(returnUrl);
    url.searchParams.set('error', message.slice(0, 200));
    return url.toString();
  }

  /** provider 콘솔에 등록해 둔 것과 글자 하나까지 같아야 한다 */
  private callbackUrl(provider: ProviderName): string {
    const base = this.config.get<string>('PUBLIC_BASE_URL');
    if (!base) {
      throw new BadRequestException(
        'PUBLIC_BASE_URL이 설정되지 않았어요. 배포한 주소를 .env에 넣어 주세요.',
      );
    }
    return `${base.replace(/\/$/, '')}/api/auth/${provider}/callback`;
  }
}

/** 원문은 어디에도 남기지 않는다 — challenge만 저장·대조한다 */
function challengeFrom(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}
