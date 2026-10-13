import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { CurrentReader } from '../common/current-reader.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  PROVIDERS as PROVIDER_NAMES,
  type ProviderName,
} from '../readers/reader.schema';
import { AuthService } from './auth.service';
import {
  ExchangeCodeDto,
  OAuthCallbackDto,
  OAuthStartDto,
  RefreshDto,
  ReviewSignInDto,
  TicketExchangeDto,
} from './dto/auth.dto';
import { OAuthSessionService } from './oauth-session.service';
import { TokenService } from './token.service';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMIT } from '../common/rate-limit';

const ProviderEnum = Object.fromEntries(
  PROVIDER_NAMES.map((p) => [p, p]),
) as Record<ProviderName, ProviderName>;

/**
 * 회원가입과 로그인이 같은 문 하나로 들어온다. 처음 온 소셜 계정이면 독자를
 * 만들고, 아니면 있던 독자로 이어준다 — 읽는 사람에게 '가입'이라는 단계를
 * 따로 만들 이유가 없다.
 *
 * refresh·logout·exchange가 :provider보다 먼저 선언돼 있어야 한다. 나중에
 * 두면 그 이름이 provider 이름 자리로 먼저 잡힌다.
 *
 * 로그인은 둘로 갈린다. **Apple**은 iOS 시스템 창이 앱에 identityToken을
 * 바로 주므로 `POST /auth/apple`이 그대로 대조한다. **카카오·네이버·구글**은
 * 브라우저 동의 화면을 거친다 — `start`가 그 화면을 열고, provider가
 * `callback`으로 돌아오면 앱의 딥링크로 1회용 티켓을 실어 돌려보내고,
 * 앱은 `exchange`로 그 티켓을 진짜 토큰과 바꾼다(`OAuthSessionService`).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly oauthSession: OAuthSessionService,
  ) {}

  @Throttle({ default: RATE_LIMIT.auth })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.tokens.rotate(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.tokens.revoke(dto.refreshToken);
  }

  @Throttle({ default: RATE_LIMIT.auth })
  @Post('exchange')
  @HttpCode(200)
  exchange(@Body() dto: TicketExchangeDto) {
    return this.oauthSession.redeem(dto.ticket, dto.codeVerifier);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentReader() readerId: string) {
    return this.auth.me(readerId);
  }

  /** App Store 심사용 — IS_APPLE_REVIEW=true 일 때만 동작한다 */
  @Get('review')
  reviewMode() {
    return { enabled: this.auth.isReviewEnabled() };
  }

  @Throttle({ default: RATE_LIMIT.auth })
  @Post('review')
  @HttpCode(200)
  reviewSignIn(@Body() dto: ReviewSignInDto) {
    return this.auth.reviewSignIn(dto.username, dto.password);
  }

  @Throttle({ default: RATE_LIMIT.auth })
  @Get(':provider/start')
  @Redirect()
  async start(
    @Param('provider', new ParseEnumPipe(ProviderEnum)) provider: ProviderName,
    @Query() dto: OAuthStartDto,
  ) {
    const url = await this.oauthSession.authorizeUrl(provider, dto);
    return { url };
  }

  @Throttle({ default: RATE_LIMIT.auth })
  @Get(':provider/callback')
  @Redirect()
  async callback(
    @Param('provider', new ParseEnumPipe(ProviderEnum)) provider: ProviderName,
    @Query() dto: OAuthCallbackDto,
  ) {
    const url = await this.oauthSession.finish(provider, dto);
    return { url };
  }

  @Throttle({ default: RATE_LIMIT.auth })
  @Post(':provider')
  @HttpCode(200)
  signIn(
    @Param('provider', new ParseEnumPipe(ProviderEnum)) provider: ProviderName,
    @Body() dto: ExchangeCodeDto,
  ) {
    return this.auth.signIn(provider, dto);
  }
}
