import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { Model } from 'mongoose';
import { Reader } from '../readers/reader.schema';

/** 액세스 토큰이 실어 나르는 것은 독자 한 명뿐이다. */
export type AccessPayload = { sub: string };

export type AuthedRequest = Request & { readerId?: string };

/**
 * Authorization: Bearer <액세스 토큰>을 검사한다.
 *
 * 토큰이 말하는 것은 '누구인가' 하나뿐이고, '무엇을 볼 수 있는가'는 검사하지
 * 않는다 — 소유 검사는 서비스가 readerId로 걸러서 한다. 가드가 둘 다 하려
 * 들면 어느 쪽도 믿을 수 없게 된다.
 *
 * **그 독자가 아직 있는지는 본다.** 서명만 보면 계정을 지운 뒤에도 다른 기기에 남은
 * 액세스 토큰이 만료(기본 15분)까지 통해서, 그 사이 담은 문장이 지워진 독자 이름으로
 * 주인 없이 남는다. 401을 받은 앱은 토큰을 새로 받으려다 리프레시도 지워진 것을 보고
 * 로그인을 끝낸다. 요청마다 `_id` 한 번이라 값이 싸다.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @InjectModel(Reader.name) private readonly readers: Model<Reader>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('로그인이 필요해요.');
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      throw new UnauthorizedException(
        '로그인이 만료됐어요. 다시 로그인해 주세요.',
      );
    }

    if (!(await this.readers.exists({ _id: payload.sub }))) {
      throw new UnauthorizedException(
        '계정을 찾지 못했어요. 다시 로그인해 주세요.',
      );
    }
    request.readerId = payload.sub;
    return true;
  }
}

/**
 * 토큰이 없어도 들어오는 길에 — 있으면 누구인지 적어 둔다. 로그인하는 길이 이걸 써서,
 * 익명으로 쓰던 독자가 로그인하면 그 기록을 로그인한 계정으로 옮긴다.
 *
 * **토큰이 붙어 왔는데 틀리면 막는다.** 조용히 없는 셈 치면 만료된 익명 토큰으로
 * 로그인했을 때 합치기가 건너뛰어지고, 익명으로 쌓은 기록이 주인 없이 남는다.
 * 401을 받은 앱은 토큰을 새로 받아 다시 보낸다.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header) return true;

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('로그인 정보가 올바르지 않아요.');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      request.readerId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException(
        '로그인이 만료됐어요. 다시 로그인해 주세요.',
      );
    }
  }
}
