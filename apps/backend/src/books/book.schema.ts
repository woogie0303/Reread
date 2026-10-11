import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * 장르 갈래. 책 검색(카카오·Open Library)은 장르를 안 주거나(카카오) 정돈되지 않은
 * 태그 뭉치라(Open Library) 자동으로 채우지 못한다 — 등록 화면에서 독자가 이 목록
 * 중 하나를 고른다.
 */
export const GENRES = [
  '소설',
  '판타지·SF',
  '미스터리·스릴러',
  '로맨스',
  '청소년·아동',
  '에세이',
  '시',
  '희곡',
  '인문·철학',
  '역사',
  '전기·자서전',
  '사회과학',
  '경제·경영',
  '과학',
  '예술',
  '자기계발',
  '기타',
] as const;
export type Genre = (typeof GENRES)[number];

/**
 * 책 — 문장이 온 곳이자 읽은 기록 그 자체다. 어휘 항목은 책에 속하지 않는다
 * (여러 책을 건너다니는 것이 어휘 항목이고, 그 이동이 재회다). 책에 남는 것은
 * 진도와, 어휘 항목 없이 그냥 좋아서 담아둔 문장뿐이다.
 */
@Schema({ timestamps: true })
export class Book {
  @Prop({ type: Types.ObjectId, ref: 'Reader', required: true, index: true })
  readerId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  author!: string;

  @Prop({ min: 1 })
  pages?: number;

  /** 표지 이미지 주소. 없으면 앱이 책등 색만으로 책을 그린다. */
  @Prop()
  cover?: string;

  @Prop({ type: String, enum: GENRES })
  genre?: Genre;

  /** 책등 그라디언트 두 색 — 라벨 없이 출처를 알려준다 */
  @Prop({ type: [String], default: [] })
  spine!: string[];

  @Prop({ default: 0, min: 0 })
  currentPage!: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  lastReadAt?: Date;

  /** 다 읽은 날 */
  @Prop()
  finishedAt?: Date;

  /**
   * 홈 맨 위에 크게 세울 책. 한 독자에 한 권뿐이다 — 고정하면 다른 책의 고정은
   * 풀린다(`books.service.ts`). 고정한 책이 없으면 가장 최근에 읽은 책이 선다.
   */
  @Prop({ default: false })
  pinned!: boolean;
}

export type BookDocument = HydratedDocument<Book>;
export const BookSchema = SchemaFactory.createForClass(Book);

/** 내 책장은 언제나 '내 것 중에서' 찾는다 */
BookSchema.index({ readerId: 1, createdAt: -1 });
