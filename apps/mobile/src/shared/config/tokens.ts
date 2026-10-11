/**
 * Reread의 색.
 *
 * 바탕이 흰색이 아니라 **종이색**이다. 원서를 읽는 동안 곁에 두는 앱이라
 * 임상적인 순백 위의 테크 블루는 화면을 차갑게 만들었다 — 종이 위의 먹과
 * 테라코타로 바꾼다. 세리프/산세리프 규칙(책에서 온 영어만 세리프)은 그대로다.
 *
 * 포인트 색은 장식이 아니라 **기능색 하나**다. "지금 보는 것"과 "재회"를 뜻하고,
 * 화면당 한 번만 쓴다. 파랑에서 테라코타(#B3492A)로 옮긴 이유는 둘이다 — 종이
 * 위에서 붙는 색이어야 했고(파랑은 테크 제품의 색이라 차가웠다), 이미 쓰는 상태색
 * (positive #0E8A3E)과 색상(hue)이 겹치지 않아야 했다. 초록 계열 후보는 hue가
 * positive와 9°밖에 안 떨어져 있어 재회 배지가 '외웠어요' 칩과 헷갈릴 수 있었다.
 * 값은 종이 위에서 4.5:1을 넘도록 잡았다.
 *
 * 알파 헬퍼는 원색(primitive)에서만 파생된다.
 *
 * 웹(`apps/web`)과는 이제 갈라진다 — 두 앱을 잇는 코드는 원래 없었고(교차 import
 * 0, 공유 패키지 없음) 값도 이미 서로 어긋나 있었다. 모바일이 실제로 백엔드에
 * 붙어 있는 쪽이라 여기가 앞선다.
 */

/** 잉크 위에 얹는 흰색 */
export const onInk = (a: number) => `rgba(255,255,255,${a})`;
/** 종이 위의 먹 — 따뜻한 먹색 */
export const slate = (a: number) => `rgba(28,25,21,${a})`;
/** 중립 채움 — 종이에 맞춘 따뜻한 회색 */
export const neutral = (a: number) => `rgba(120,113,108,${a})`;
/** 포인트 색 — 테라코타 */
export const accent = (a: number) => `rgba(179,73,42,${a})`;
/** 잉크를 덮개로 쓸 때 — 뷰파인더 위, 시트 뒤 */
export const ink = (a: number) => `rgba(22,19,15,${a})`;

export const color = {
  /* --- brand ---------------------------------------------------------- */
  primary: '#B3492A',
  /** 눌린 상태처럼 더 짙게 쓸 자리 — 아직 화면에서 쓰지 않는다 */
  primaryStrong: '#90381D',
  primaryBg: accent(0.06),
  primaryBgSoft: accent(0.05),
  primaryTint: accent(0.1),
  primaryLine: accent(0.2),

  /* --- text -----------------------------------------------------------
   * 종이 위 대비비를 재서 잡은 값이다. 정보를 지닌 글은 전부 4.5:1을 넘는다.
   * 예전에는 meta가 2.88, assistive가 1.83이어서 "그 책을 찾지 못했어요" 같은
   * 오류 문구를 읽을 수 없었다.
   */
  text: {
    primary: '#1C1915',
    neutral: slate(0.88),
    body: slate(0.76),
    secondary: slate(0.68),
    /** 날짜·쪽수·개수처럼 작지만 사실을 지닌 글 — 종이 4.84 / 회색판 4.70 */
    meta: slate(0.62),
    /** 아이콘·자리표시자·스피너 전용(3.12:1). **혼자 뜻을 지니면 안 된다.** */
    assistive: slate(0.48),
    onInk: '#FFFFFF',
    onInkStrong: onInk(0.92),
    onInkBody: onInk(0.9),
    onInkMuted: onInk(0.6),
    onInkSecondary: onInk(0.55),
    onInkMeta: onInk(0.55),
    onInkAssistive: onInk(0.45),
  },

  /* --- surface -------------------------------------------------------- */
  surface: {
    /** 종이 — 앱의 바탕 */
    base: '#FDFBF7',
    alt: '#F4F1EA',
    /** 카드는 바탕보다 한 겹 밝다 — 선이 아니라 밝기로 떠오른다 */
    card: '#FFFFFF',
    /** 잉크 — 지금 집중해야 할 것 하나에만 쓴다 */
    ink: '#16130F',
    /** 촬영된 책 페이지. 바탕보다 어두워야 '사진 속 종이'로 읽힌다 */
    page: '#EDE9E1',
    /** 캔버스 배경(디자인 문서의 바깥 여백) */
    canvas: '#1C1915',
  },

  /* --- fill / line ---------------------------------------------------- */
  fill: {
    subtle: neutral(0.05),
    default: neutral(0.08),
    normal: neutral(0.1),
    bold: neutral(0.18),
    onInk: onInk(0.08),
    onInkStrong: onInk(0.1),
  },
  border: {
    hairline: neutral(0.1),
    subtle: neutral(0.14),
    default: neutral(0.18),
    strong: neutral(0.24),
    onInk: onInk(0.12),
  },

  /* --- status --------------------------------------------------------- */
  status: {
    positive: '#0E8A3E',
    positiveText: '#0A6E31',
    positiveBg: 'rgba(14,138,62,0.1)',
    cautionary: '#B25E00',
    negative: '#C62828',
    negativeBg: 'rgba(198,40,40,0.08)',
  },
} as const;

/**
 * 화면의 좌우 여백. 값 하나뿐인 것이 요점이다 —
 *
 * 한동안 헤더는 24, 본문은 화면마다 20이나 24였다. 4px 차이는 한 화면만 보면
 * 보이지 않지만, 뒤로가기 화살표가 그 아래 글보다 4px 밖에 서 있고 화면을
 * 옮길 때마다 글이 좌우로 흔들린다. 여백은 눈에 띄는 순간 이미 틀린 것이라,
 * 고를 수 있게 두지 않고 한 값으로 못 박는다.
 *
 * 카드 안쪽 여백은 여기 없다 — 그건 카드가 제 크기에 맞춰 정한다.
 */
export const gutter = 20;

/** 그림자는 옅고 퍼짐이 적다. 종이 위라 색도 먹 쪽으로 따뜻하다. */
export const shadow = {
  card: {
    shadowColor: '#1C1915',
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cover: {
    shadowColor: '#1C1915',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  primary: {
    shadowColor: '#B3492A',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  fab: {
    shadowColor: '#B3492A',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;
