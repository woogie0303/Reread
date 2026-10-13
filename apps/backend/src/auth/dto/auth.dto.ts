import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * `POST /auth/:provider`로 들어오는 것 — 이제 사실상 Apple 전용이다.
 *
 * Apple의 iOS 시스템 창이 앱에 identityToken을 바로 주고, 서버는 바꾸지
 * 않고 **누구에게 발급된 것인지 대조**한다. 카카오·네이버·구글은
 * `/auth/:provider/start`·`/callback`·`/auth/exchange`(모두
 * `OAuthSessionService`)가 대신 맡는다 — 브라우저 동의 화면을 거친 인가
 * 코드는 이제 이 문으로 들어오지 않는다.
 */
export class ExchangeCodeDto {
  /** Apple이 준 서명된 identityToken */
  @IsString()
  @MinLength(1)
  idToken!: string;

  /**
   * 앱이 따로 알고 있는 이름 — Apple만 쓴다. Apple은 이름을 토큰에 넣지 않고
   * 처음 로그인할 때 앱에만 한 번 알려준다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40, { message: '이름은 40자까지만 받아요.' })
  nickname?: string;

  /**
   * Apple이 로그인 때 함께 준 1회용 코드. 서버가 refresh token으로 바꿔 두었다가
   * 계정을 지울 때 Apple 쪽 연결을 끊는 데 쓴다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  authorizationCode?: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

/**
 * 앱이 `GET /auth/:provider/start`를 열 때 실어 보내는 것.
 *
 * `challenge`는 앱이 만든 PKCE code_verifier를 SHA256 → base64url로 접은
 * 것이다(43자, 패딩 없음). 이 요청에서 provider에게 넘기지는 않는다 — 서명한
 * state 안에 실어 콜백까지 들고 갔다가, 나중에 `/auth/exchange`에서
 * code_verifier와 대조하는 용도로만 쓴다.
 */
export class OAuthStartDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message: 'challenge는 SHA256을 base64url로 접은 43자여야 해요.',
  })
  challenge!: string;

  /**
   * 로그인이 끝나고 앱으로 돌아올 딥링크. `reread://auth`(빌드된 앱) 또는
   * `exp://…/--/auth`(Expo Go, 개발용) 꼴 — 스킴이 허용 목록에 없으면 막는다
   * (open redirect 방지).
   */
  @IsString()
  @MinLength(1)
  returnUrl!: string;
}

/**
 * provider가 `GET /auth/:provider/callback`으로 돌려줄 때 붙여 오는 것.
 *
 * 성공하면 `code`가, 사용자가 동의 화면에서 거절하면 `error`가 온다 — 카카오·
 * 네이버·구글 셋 다 실패를 이 모양으로 알린다. `state`는 늘 온다.
 */
export class OAuthCallbackDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsString()
  @MinLength(1)
  state!: string;

  /** 구글이 더 붙여 보내는 것들 — 쓰지 않지만 whitelist가 거절하지 않게 선언만 해 둔다 */
  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  authuser?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  iss?: string;
}

/** `POST /auth/review` — 심사용 계정 로그인 */
export class ReviewSignInDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  password!: string;
}

/**
 * `POST /auth/exchange` — 딥링크로 받은 티켓을 진짜 토큰으로 바꾼다.
 *
 * `codeVerifier`의 SHA256(base64url)이 티켓에 적힌 challenge와 같아야 한다.
 * 다르면 이 티켓은 내가 시작한 로그인이 아니라는 뜻이라 거절한다.
 */
export class TicketExchangeDto {
  @IsString()
  @MinLength(1)
  ticket!: string;

  @IsString()
  @MinLength(43)
  @MaxLength(128)
  codeVerifier!: string;
}
