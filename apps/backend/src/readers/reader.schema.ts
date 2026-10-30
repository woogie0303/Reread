import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const PROVIDERS = ['kakao', 'naver', 'google', 'apple'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

/**
 * 소셜 계정 하나. 독자는 여러 개를 붙일 수 있고, (제공자, 제공자 안의 id)가
 * 같은 사람을 두 번 만들지 않게 막는 열쇠다.
 */
@Schema({ _id: false })
export class LinkedAccount {
  @Prop({ type: String, enum: PROVIDERS, required: true })
  provider!: ProviderName;

  @Prop({ required: true })
  providerId!: string;

  @Prop()
  email?: string;

  @Prop({ default: () => new Date() })
  linkedAt!: Date;

  /**
   * Apple 로그인만. 계정을 지울 때 Apple 쪽 연결을 끊는 데 쓴다(`AppleTokenService`).
   * 앱으로 내려가는 `toView`에는 싣지 않는다.
   */
  @Prop()
  refreshToken?: string;
}

export const LinkedAccountSchema = SchemaFactory.createForClass(LinkedAccount);

/**
 * 광고를 보고 받은 사용량. 달이 바뀌면 저절로 비워진다 — 남은 몫을 되돌리는
 * 일 없이, 적힌 달이 이번 달이 아니면 0으로 읽는다(`AsksService.quota`와 같은 생각).
 */
@Schema({ _id: false })
export class AskBonus {
  /** 이 보너스가 속한 달, `YYYY-MM` */
  @Prop({ required: true })
  month!: string;

  /**
   * 이번 달에 광고로 받은 사용량(달러). 예전에는 질문 수(`granted`)를 적었다 — 그 값은
   * 단위가 달라 읽지 않는다.
   */
  @Prop({ default: 0 })
  credit!: number;

  /** 오늘 날짜 `YYYY-MM-DD`와 오늘 본 광고 수 — 하루에 받을 수 있는 횟수를 막는다 */
  @Prop({ required: true })
  day!: string;

  @Prop({ default: 0 })
  dayCount!: number;
}

export const AskBonusSchema = SchemaFactory.createForClass(AskBonus);

/**
 * 이번 달 질문 사용량. 월 몫은 이 값으로 정한다(`asks/ask-usage.ts`). 질문마다 적힌
 * 비용(`Ask.cost`)을 더해서 세면 질문을 지울 때 몫이 돌아와서, 질문을 지워도 줄지 않는
 * 이곳에 따로 더한다. 적힌 달이 이번 달이 아니면 이번 달 질문에서 다시 센다 — 0으로
 * 되돌리는 일은 없다.
 */
@Schema({ _id: false })
export class AskUsage {
  /** 이 값이 속한 달, `YYYY-MM` */
  @Prop({ required: true })
  month!: string;

  /** 이번 달에 쓴 모델 비용(달러) */
  @Prop({ default: 0 })
  spent!: number;

  /** 이번 달에 물어본 횟수 — 한 쪽에서 한 번에 물은 묶음이 한 번이다. 남은 횟수를 어림할 때만 쓴다 */
  @Prop({ default: 0 })
  batches!: number;
}

export const AskUsageSchema = SchemaFactory.createForClass(AskUsage);

/**
 * 읽는 사람. 비밀번호가 없다 — 로그인은 카카오·네이버·구글·Apple로만 들어온다.
 *
 * 레벨은 두지 않는다. 한때 스스로 밝힌 영어 레벨(입문·중급·고급)을 받아 뜻을
 * 풀어 쓰는 깊이를 정했는데, 한국어 책과 영어 밖의 원서까지 담게 되면서 사람
 * 하나에 레벨 하나로는 맞지 않았다(영어는 고급이어도 일본어는 입문이고, 한국어는
 * 모국어다). 무엇을 골라줄지는 독자가 이 문장에서 막혔다는 사실과, 담느냐
 * 넘기느냐가 정한다. 예전 문서에 남은 `level` 필드는 읽지 않는다.
 */
@Schema({ timestamps: true, collection: 'readers' })
export class Reader {
  @Prop({ required: true })
  nickname!: string;

  @Prop()
  email?: string;

  @Prop()
  profileImage?: string;

  /** 다 읽은 책의 수 */
  @Prop({ default: 0 })
  booksFinished!: number;

  @Prop({ type: [LinkedAccountSchema], default: [] })
  accounts!: LinkedAccount[];

  @Prop({ type: AskBonusSchema })
  askBonus?: AskBonus;

  @Prop({ type: AskUsageSchema })
  askUsage?: AskUsage;
}

export type ReaderDocument = HydratedDocument<Reader>;
export const ReaderSchema = SchemaFactory.createForClass(Reader);

/**
 * 같은 소셜 계정으로 두 사람이 생기지 않게 한다. 배열이 비어 있는 문서끼리
 * 부딪히지 않도록 sparse로 둔다.
 */
ReaderSchema.index(
  { 'accounts.provider': 1, 'accounts.providerId': 1 },
  { unique: true, sparse: true },
);
