import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Ask, AskSchema } from '../asks/ask.schema';
import { Book, BookSchema } from '../books/book.schema';
import { LexicalItem, LexicalItemSchema } from '../items/lexical-item.schema';
import { ReadingLog, ReadingLogSchema } from '../reading/reading-log.schema';
import { Reader, ReaderSchema } from '../readers/reader.schema';
import { Retell, RetellSchema } from '../retells/retell.schema';
import { Sentence, SentenceSchema } from '../sentences/sentence.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppleTokenService } from './oauth/apple-token.service';
import { OAuthSessionService } from './oauth-session.service';
import { ReaderMergeService } from './reader-merge.service';
import { OAuthTicket, OAuthTicketSchema } from './schemas/oauth-ticket.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import { TokenService } from './token.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reader.name, schema: ReaderSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: OAuthTicket.name, schema: OAuthTicketSchema },
      /** 익명으로 쓰다 로그인하면 그 기록을 옮긴다(`ReaderMergeService`) — 독자의 것이 다 필요하다 */
      { name: Book.name, schema: BookSchema },
      { name: Sentence.name, schema: SentenceSchema },
      { name: LexicalItem.name, schema: LexicalItemSchema },
      { name: Ask.name, schema: AskSchema },
      { name: Retell.name, schema: RetellSchema },
      { name: ReadingLog.name, schema: ReadingLogSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: Number(config.get('ACCESS_TOKEN_TTL_SECONDS') ?? 60 * 15),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    OAuthSessionService,
    AppleTokenService,
    ReaderMergeService,
  ],
  /**
   * 가드가 JwtService와 독자 모델(그 독자가 아직 있는지)을, 다른 모듈이 소유 검사를 위해
   * 서비스들을 쓴다. 가드는 쓰는 모듈 안에서 만들어지므로 독자 모델도 함께 내보낸다.
   */
  exports: [
    JwtModule,
    MongooseModule,
    AuthService,
    TokenService,
    AppleTokenService,
  ],
})
export class AuthModule {}
