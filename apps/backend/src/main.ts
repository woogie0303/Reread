// 다른 import보다 먼저 — Sentry가 나머지 모듈을 감시하려면 먼저 시작해야 한다
import './instrument';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { trustProxyHops } from './common/rate-limit';
import { validationException } from './common/validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /**
   * 호스팅의 프록시 뒤에서 진짜 클라이언트 IP를 읽으려면 몇 단을 믿을지 알려줘야 한다
   * (`common/rate-limit.ts`). 틀리면 로그인 전 요청의 호출 횟수 제한이 사람이 아니라
   * 서버 전체에 걸리므로, 어떻게 읽고 있는지 부팅할 때마다 말한다.
   */
  const hops = trustProxyHops();
  app.set('trust proxy', hops);
  console.log(`프록시 신뢰 단 수: ${hops}`);

  /** 보안 헤더 — JSON만 주는 서버라 기본값 그대로 쓴다 */
  app.use(helmet());

  app.setGlobalPrefix('api');

  // DTO에 선언한 것만 통과시킨다 — 클라이언트가 보낸 여분 필드는 버린다.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      /** 영어 기본 메시지가 앱에 그대로 보이지 않게 한다 — 원문은 로그에 남긴다 */
      exceptionFactory: (errors) =>
        validationException(errors, (original) =>
          new Logger('Validation').warn(original),
        ),
    }),
  );

  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`CallMe API — http://localhost:${port}/api`);
}

void bootstrap();
