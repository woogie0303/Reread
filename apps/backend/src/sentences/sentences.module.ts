import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Ask, AskSchema } from '../asks/ask.schema';
import { Book, BookSchema } from '../books/book.schema';
import { LexicalItem, LexicalItemSchema } from '../items/lexical-item.schema';
import { Reader, ReaderSchema } from '../readers/reader.schema';
import { Sentence, SentenceSchema } from './sentence.schema';
import { SentencesController } from './sentences.controller';
import { SentencesService } from './sentences.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sentence.name, schema: SentenceSchema },
      { name: Book.name, schema: BookSchema },
      { name: LexicalItem.name, schema: LexicalItemSchema },
      { name: Ask.name, schema: AskSchema },
      { name: Reader.name, schema: ReaderSchema },
    ]),
    AuthModule,
  ],
  controllers: [SentencesController],
  providers: [SentencesService],
})
export class SentencesModule {}
