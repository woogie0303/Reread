import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Reader,
  type ProviderName,
  type ReaderDocument,
} from '../readers/reader.schema';
import { PROVIDERS, type OAuthProfile, type ProviderConfig } from './oauth';
import type { ExchangeCodeDto } from './dto/auth.dto';
import { AppleTokenService } from './oauth/apple-token.service';
import { ReaderMergeService } from './reader-merge.service';
import { TokenService, type IssuedTokens } from './token.service';

export type ReaderView = {
  id: string;
  nickname: string;
  email?: string;
  profileImage?: string;
  booksFinished: number;
  providers: ProviderName[];
  /** 소셜 계정이 하나도 없다 — 로그인 없이 쓰는 중. 앱이 로그인을 권할지 이걸로 안다 */
  anonymous: boolean;
};

/** 로그인 없이 들어온 독자의 이름. 로그인하면 소셜 계정의 이름으로 바뀐다 */
const ANONYMOUS_NICKNAME = '독자';

export type SignInResult = IssuedTokens & { reader: ReaderView };

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Reader.name) private readonly readers: Model<Reader>,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly appleToken: AppleTokenService,
    private readonly merge: ReaderMergeService,
  ) {}

  /**
   * `POST /auth/anonymous` — 로그인 없이 쓰는 독자를 만든다. 소셜 계정이 없을 뿐 다른
   * 독자와 똑같이 토큰 두 장을 받고, 질문 몫만 작다(`AsksService.quota`). 나중에
   * 로그인하면 이 독자의 기록이 그 계정으로 옮겨진다(`enter`).
   */
  async anonymous(): Promise<SignInResult> {
    const reader = await this.readers.create({ nickname: ANONYMOUS_NICKNAME });
    const issued = await this.tokens.issue(reader.id);
    return { ...issued, reader: toView(reader) };
  }

  /**
   * 소셜 계정의 독자로 들어간다. 익명으로 쓰던 독자가 함께 왔으면(그 토큰을 붙여
   * 로그인했으면) 먼저 그 기록을 옮겨 둔다 — 옮기지 않고 들어가면 익명으로 담은 것이
   * 주인 없이 남는다.
   */
  async enter(readerId: string, anonymousId?: string): Promise<SignInResult> {
    if (anonymousId) await this.merge.absorb(anonymousId, readerId);
    const issued = await this.tokens.issue(readerId);
    return { ...issued, reader: await this.me(readerId) };
  }

  /**
   * `POST /auth/:provider` — 이제 사실상 Apple 전용이다. Apple의 iOS 시스템
   * 창이 앱에 바로 준 identityToken을 대조한다(`verify`). 카카오·네이버·구글은
   * `OAuthSessionService`(브라우저 동의 화면 + 서버 콜백 + 티켓 교환)가
   * `findOrCreate`·`configFor`를 그대로 가져다 쓴다.
   */
  async signIn(
    provider: ProviderName,
    dto: ExchangeCodeDto,
    anonymousId?: string,
  ): Promise<SignInResult> {
    const config = this.configFor(provider);
    const impl = PROVIDERS[provider];

    if (!impl.verify) {
      throw new UnauthorizedException(
        `${provider}은(는) 이 문으로 로그인하지 않아요.`,
      );
    }
    const profile = await impl.verify(
      { idToken: dto.idToken, nickname: dto.nickname },
      config,
    );
    const reader = await this.findOrCreate(provider, profile);
    if (provider === 'apple' && dto.authorizationCode) {
      await this.keepAppleRefreshToken(
        reader.id,
        profile.providerId,
        dto.authorizationCode,
      );
    }
    return this.enter(reader.id, anonymousId);
  }

  /**
   * 코드를 refresh token으로 바꿔 그 Apple 계정에 적어 둔다. 못 바꿔도 로그인은
   * 그대로 된다(`AppleTokenService.exchangeCode`가 던지지 않는다).
   */
  private async keepAppleRefreshToken(
    readerId: string,
    providerId: string,
    authorizationCode: string,
  ): Promise<void> {
    const refreshToken = await this.appleToken.exchangeCode(authorizationCode);
    if (!refreshToken) return;
    await this.readers.updateOne(
      { _id: readerId },
      { $set: { 'accounts.$[apple].refreshToken': refreshToken } },
      {
        arrayFilters: [
          { 'apple.provider': 'apple', 'apple.providerId': providerId },
        ],
      },
    );
  }

  /** IS_APPLE_REVIEW=true 일 때만 동작하는 심사용 계정 로그인 */
  async reviewSignIn(
    username: string,
    password: string,
    anonymousId?: string,
  ): Promise<SignInResult> {
    const enabled = this.config.get<string>('IS_APPLE_REVIEW') === 'true';
    if (!enabled) throw new UnauthorizedException('심사 모드가 꺼져 있어요.');

    const expectedUser = this.config.get<string>('REVIEW_USERNAME');
    const expectedPass = this.config.get<string>('REVIEW_PASSWORD');

    if (!expectedUser || !expectedPass) {
      throw new UnauthorizedException('심사 계정이 설정되지 않았어요.');
    }
    if (username !== expectedUser || password !== expectedPass) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 맞지 않아요.');
    }

    const reader = await this.findOrCreate('apple', {
      providerId: 'review-account-reread-001',
      nickname: '심사용 계정',
    });
    return this.enter(reader.id, anonymousId);
  }

  isReviewEnabled(): boolean {
    return this.config.get<string>('IS_APPLE_REVIEW') === 'true';
  }

  async me(readerId: string): Promise<ReaderView> {
    const reader = await this.readers.findById(readerId);
    if (!reader) throw new NotFoundException('그 독자를 찾지 못했어요.');
    return toView(reader);
  }

  /**
   * 같은 소셜 계정으로 들어오면 늘 같은 독자다.
   *
   * 이메일이 같다고 다른 제공자의 계정을 자동으로 붙이지는 않는다 — 제공자가
   * 확인해 준 이메일이라는 보장이 없고, 남의 계정을 넘겨받는 길이 되기 때문이다.
   * 계정을 합치는 일은 로그인한 상태에서 따로 해야 한다.
   */
  async findOrCreate(
    provider: ProviderName,
    profile: OAuthProfile,
  ): Promise<ReaderDocument> {
    const existing = await this.readers.findOne({
      'accounts.provider': provider,
      'accounts.providerId': profile.providerId,
    });

    if (existing) return existing;

    return this.readers.create({
      nickname: profile.nickname,
      email: profile.email,
      profileImage: profile.profileImage,
      accounts: [
        {
          provider,
          providerId: profile.providerId,
          email: profile.email,
          linkedAt: new Date(),
        },
      ],
    });
  }

  /**
   * 제공자별 client id·secret.
   *
   * 구글만 예외다 — `GOOGLE_WEB_CLIENT_ID`를 따로 쓴다. 브라우저 동의 화면 +
   * 서버 콜백으로 코드를 받으려면 **"웹 애플리케이션" 타입** 클라이언트(시크릿이
   * 있는 confidential client)가 있어야 하는데, 예전에 네이티브 앱에서 idToken을
   * 대조하던 iOS 타입 클라이언트는 시크릿이 없어 이 길을 못 탄다. 카카오·네이버는
   * REST API 키 하나로 두 길을 다 타서 이름을 나누지 않는다.
   */
  configFor(provider: ProviderName): ProviderConfig {
    const key = provider === 'google' ? 'GOOGLE_WEB' : provider.toUpperCase();
    const clientId = this.config.get<string>(`${key}_CLIENT_ID`);

    if (!clientId) {
      throw new InternalServerErrorException(
        `${key}_CLIENT_ID가 설정되지 않았어요. .env를 확인해 주세요.`,
      );
    }

    return {
      clientId,
      clientSecret: this.config.get<string>(`${key}_CLIENT_SECRET`),
    };
  }
}

export function toView(reader: ReaderDocument): ReaderView {
  return {
    id: reader.id,
    nickname: reader.nickname,
    email: reader.email,
    profileImage: reader.profileImage,
    booksFinished: reader.booksFinished,
    providers: reader.accounts.map((account) => account.provider),
    anonymous: reader.accounts.length === 0,
  };
}
