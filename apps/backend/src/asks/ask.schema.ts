import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const ASK_STATUSES = ['answered', 'pending'] as const;
export type AskStatus = (typeof ASK_STATUSES)[number];

/** 답을 못 받은 이유. 독자에게 그대로 보여줄 말이라 한국어로 둔다. */
export const PENDING_REASONS = [
  '질문 소진',
  '연결 실패',
  /** 묻는 도중에 앱이 꺼지거나 서버가 멈춰 답이 오지 않은 채 남았다 */
  '중간에 끊김',
] as const;
export type PendingReason = (typeof PENDING_REASONS)[number];

/**
 * 독자가 이 문장에서 **직접 고른** 표현. 묻기 전에는 문장에 적힌 꼴(`surface`)뿐이고,
 * 답이 오면 모델이 사전에 실릴 꼴(`term`)과 그 문장에서의 뜻을 채운다. 그 순간
 * 서버가 어휘 항목으로 담는다 — 고른 것은 독자이니 한 번 더 고르게 하지 않는다.
 *
 * `term`이 따로 있어야 재회가 된다. 'brushed it off'와 'brushes it off'는 둘 다
 * 'brush it off'로 담겨야 같은 표현으로 만난다((readerId, term) 유일 인덱스).
 */
@Schema({ _id: false })
export class AskPick {
  /** 문장에 적힌 꼴 그대로 — 독자가 짚은 것 */
  @Prop({ required: true })
  surface!: string;

  @Prop()
  term?: string;

  @Prop()
  meaning?: string;

  /**
   * 번역(`Ask.translation`)에서 이 표현에 해당하는 글자. 앱이 번역에 같은 밑줄을 긋는 데 쓴다.
   * 번역에 실제로 있는 글자만 담긴다(`matchAnswer`). 없으면 줄을 긋지 않는다.
   */
  @Prop()
  translationSpan?: string;

  /** 담긴 어휘 항목 */
  @Prop({ type: Types.ObjectId, ref: 'LexicalItem' })
  itemId?: Types.ObjectId;
}

export const AskPickSchema = SchemaFactory.createForClass(AskPick);

/**
 * 질문 하나 — 문장 하나와 그 문장에서 고른 표현들. 단어만 떼어 묻지 않는다 —
 * 그 문장에서의 뜻을 고를 수 없기 때문이다(ADR-0001).
 *
 * 한 쪽에서 여러 문장을 한 번에 물으면 질문이 문장마다 하나씩 생기고 같은
 * `batchId`를 나눠 갖는다. 모델은 묶음째 한 번 부르고, 이번 달 몫도 묶음 하나를
 * 한 번으로 센다.
 *
 * 답을 못 받아도 기록은 남는다. 문장은 이미 저장돼 있고 이 질문은 pending으로
 * 기다린다 — 담는 일이 실패하는 앱이면 읽다 말고 손이 멈춘다(ADR-0003).
 */
@Schema({ timestamps: true })
export class Ask {
  @Prop({ type: Types.ObjectId, ref: 'Reader', required: true, index: true })
  readerId!: Types.ObjectId;

  /** 물어본 그 문장. 질문보다 문장이 먼저 저장된다. */
  @Prop({ type: Types.ObjectId, ref: 'Sentence', required: true, index: true })
  sentenceId!: Types.ObjectId;

  /** 한 번에 물은 묶음. 예전 질문에는 없다 — 그건 혼자서 한 묶음이다. */
  @Prop({ type: Types.ObjectId, index: true })
  batchId?: Types.ObjectId;

  @Prop({ type: String, enum: ASK_STATUSES, default: 'pending', index: true })
  status!: AskStatus;

  @Prop()
  translation?: string;

  @Prop({ type: [AskPickSchema], default: [] })
  picks!: AskPick[];

  @Prop({ type: String, enum: PENDING_REASONS })
  pendingReason?: PendingReason;

  @Prop()
  answeredAt?: Date;

  /**
   * 어느 모델이 답했는지 — 나중에 답이 달라진 이유를 찾을 때 쓴다.
   * 이름이 `model`이 아닌 이유는 몽구스 문서에 이미 `model()`이 있어서다.
   */
  @Prop()
  answeredBy?: string;

  /**
   * 이 질문에 든 모델 비용(달러). 묶음을 한 번 부른 값을 답을 받은 문장 수로 나눠
   * 적는다 — 답을 못 받은 문장은 독자의 몫에서 빼지 않는다. 월 몫은 독자의 `askUsage`가
   * 정하고, 이 값은 그 값이 아직 없을 때 한 번 세는 데 쓴다(`ask-usage.ts`). 이 값이 생기기
   * 전에 답한 질문에는 없다.
   */
  @Prop()
  cost?: number;
}

export type AskDocument = HydratedDocument<Ask>;
export const AskSchema = SchemaFactory.createForClass(Ask);

/** 이번 달에 몇 번 물었는지를 세는 질의 */
AskSchema.index({ readerId: 1, status: 1, answeredAt: -1 });
