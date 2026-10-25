import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentReader } from '../common/current-reader.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { ObjectIdPipe } from '../common/object-id.pipe';
import {
  CreateSentenceDto,
  CreateThoughtDto,
  ListSentencesQuery,
  UpdateSentenceDto,
} from './dto/sentence.dto';
import { SentencesService } from './sentences.service';

@Controller('sentences')
@UseGuards(JwtAuthGuard)
export class SentencesController {
  constructor(private readonly sentences: SentencesService) {}

  @Post()
  create(@CurrentReader() readerId: string, @Body() dto: CreateSentenceDto) {
    return this.sentences.create(readerId, dto);
  }

  @Get()
  list(@CurrentReader() readerId: string, @Query() query: ListSentencesQuery) {
    return this.sentences.list(readerId, query);
  }

  /** `:id`보다 먼저 선언해야 한다 — 나중에 두면 이 이름이 id 자리로 먼저 잡힌다 */
  @Get('anonymous-limit')
  anonymousLimit(@CurrentReader() readerId: string) {
    return this.sentences.anonymousLimit(readerId);
  }

  @Get(':id')
  find(
    @CurrentReader() readerId: string,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.sentences.find(readerId, id);
  }

  @Patch(':id')
  update(
    @CurrentReader() readerId: string,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: UpdateSentenceDto,
  ) {
    return this.sentences.update(readerId, id, dto);
  }

  @Post(':id/thoughts')
  addThought(
    @CurrentReader() readerId: string,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: CreateThoughtDto,
  ) {
    return this.sentences.addThought(readerId, id, dto);
  }

  @Delete(':id/thoughts/:thoughtId')
  removeThought(
    @CurrentReader() readerId: string,
    @Param('id', ObjectIdPipe) id: string,
    @Param('thoughtId', ObjectIdPipe) thoughtId: string,
  ) {
    return this.sentences.removeThought(readerId, id, thoughtId);
  }

  /** 담은 표현만 지운다 — 문장은 남는다 */
  @Delete(':id/expressions')
  clearExpressions(
    @CurrentReader() readerId: string,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.sentences.clearExpressions(readerId, id);
  }

  @Delete(':id')
  remove(
    @CurrentReader() readerId: string,
    @Param('id', ObjectIdPipe) id: string,
  ) {
    return this.sentences.remove(readerId, id);
  }
}
