import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Book, BookSchema } from '../books/book.schema';
import { ItemsModule } from '../items/items.module';
import { Reader, ReaderSchema } from '../readers/reader.schema';
import { Sentence, SentenceSchema } from '../sentences/sentence.schema';
import { Ask, AskSchema } from './ask.schema';
import { AsksController } from './asks.controller';
import { AsksService } from './asks.service';
import { ASK_MODEL } from './model/ask-model';
import { createAskModel } from './model/model.factory';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ask.name, schema: AskSchema },
      { name: Sentence.name, schema: SentenceSchema },
      { name: Book.name, schema: BookSchema },
      { name: Reader.name, schema: ReaderSchema },
    ]),
    AuthModule,
    ItemsModule,
  ],
  controllers: [AsksController],
  providers: [
    AsksService,
    /** 어느 모델로 답할지는 환경 변수(`ASK_PROVIDER`)가 정한다 — 서비스는 `AskModel`만 안다 */
    {
      provide: ASK_MODEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createAskModel(config),
    },
  ],
})
export class AsksModule {}
