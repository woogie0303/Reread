import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { color, ink, type } from '@/shared/config';
import { AltPanel, AppText, Card, Quote } from '@/shared/ui';

/**
 * 안내 둘째 쪽의 그림 — 문장 아래 뜻은 닫혀 있고, 손가락이 '뜻 보기'를 **눌러야** 열린다.
 * 번역에서 담은 표현에 해당하는 말에는 영어 쪽 밑줄과 같은 색의 밑줄이 선다.
 *
 * 열리기 전에도 번역이 설 자리를 비워 둔다(투명하게) — 열릴 때 그림 높이가 뛰면 안내 쪽이
 * 출렁인다. 손짓 그림이라 첫째 쪽(`pick-demo.tsx`)과 같은 모양으로 한 바퀴씩 돈다.
 *
 * 예문은 퍼블릭 도메인 원문(샬럿 브론테의 『제인 에어』)이다.
 */

/** 한 바퀴의 길이와, 그 안의 장면들(ms) */
const CYCLE = 6400;
const T = {
  fingerIn: 300,
  atButton: 1200,
  pressUp: 1550,
  /** 눌린 순간 뜻이 열린다 */
  open: 1350,
  openDone: 1800,
  fingerOut: 2700,
  fadeStart: 5500,
  fadeEnd: 6100,
};

const FINGER = 30;

type Box = { x: number; y: number; width: number; height: number };

export function AskPreview({ active = true }: { active?: boolean }) {
  const reduce = useReducedMotion();
  const [button, setButton] = useState<Box>();
  const t = useSharedValue(0);

  useEffect(() => {
    /** 움직임을 줄인 독자에게는 열린 장면 하나만 보인다 */
    if (reduce) {
      t.value = T.openDone + 200;
      return;
    }
    /** 이 쪽이 보이지 않는 동안은 멈춰 닫아 둔다 — 넘어왔을 때 손가락이 처음부터 올라오게 */
    cancelAnimation(t);
    t.value = 0;
    if (!active) return;
    t.value = withRepeat(
      withTiming(CYCLE, { duration: CYCLE, easing: Easing.linear }),
      -1,
    );
  }, [active, reduce, t]);

  const onButtonLayout = (e: LayoutChangeEvent) =>
    setButton(e.nativeEvent.layout);

  /** 0 = 닫힘, 1 = 열림. 한 바퀴 끝에서 다시 닫힌다 */
  const openness = (ms: number) => {
    'worklet';
    return (
      interpolate(ms, [T.open, T.openDone], [0, 1], 'clamp') *
      interpolate(ms, [T.fadeStart, T.fadeEnd], [1, 0], 'clamp')
    );
  };

  const opened = useAnimatedStyle(() => ({ opacity: openness(t.value) }));
  const closed = useAnimatedStyle(() => ({ opacity: 1 - openness(t.value) }));

  return (
    <View style={styles.stack}>
      <Card style={styles.card}>
        <Quote style={styles.sentence}>
          {'I was puzzling to '}
          <Quote style={styles.marked}>make out</Quote>
          {' the subject of a picture on the wall.'}
        </Quote>
      </Card>
      <AltPanel style={styles.meaning}>
        {/* 두 글자(뜻 보기·뜻 닫기)가 같은 자리에 겹쳐 서서, 열리는 순간 서로 바뀐다 */}
        <View style={styles.reveal} onLayout={onButtonLayout}>
          <Animated.View style={closed}>
            <AppText style={styles.revealLabel}>뜻 보기</AppText>
          </Animated.View>
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.center, opened]}
          >
            <AppText style={styles.revealLabel}>뜻 닫기</AppText>
          </Animated.View>
        </View>
        <Animated.View style={[styles.body, opened]}>
          <AppText style={styles.meaningText}>
            {'나는 벽에 걸린 그림이 무엇을 그린 것인지 '}
            <AppText style={styles.markedKo}>알아내려</AppText>
            {' 끙끙대고 있었다.'}
          </AppText>
          <AppText style={styles.term}>
            <Quote style={styles.termQuote}>make out</Quote>
            {'  알아보다, 분간하다'}
          </AppText>
        </Animated.View>
        {button && !reduce ? <Finger t={t} button={button} /> : null}
      </AltPanel>
    </View>
  );
}

/** 아래에서 올라와 버튼을 누르고 물러나는 손가락 */
function Finger({ t, button }: { t: SharedValue<number>; button: Box }) {
  const target = {
    x: button.x + button.width / 2,
    y: button.y + button.height / 2,
  };
  const start = { x: target.x + 70, y: target.y + 80 };

  const style = useAnimatedStyle(() => {
    const ms = t.value;
    /** 천천히 떠나 천천히 닿는다(smoothstep) */
    const ease = (a: number, b: number) => {
      const k = interpolate(ms, [a, b], [0, 1], 'clamp');
      return k * k * (3 - 2 * k);
    };
    const k = ease(T.fingerIn, T.atButton);
    const x = start.x + (target.x - start.x) * k;
    const y = start.y + (target.y - start.y) * k;

    /** 누르는 동안 살짝 작아진다 — 누를 때와 뗄 때 0.12초씩 */
    const down = T.atButton;
    const press = interpolate(
      ms,
      [down, down + 120, T.pressUp - 120, T.pressUp],
      [0, 1, 1, 0],
      'clamp',
    );
    const opacity =
      interpolate(ms, [0, T.fingerIn], [0, 1], 'clamp') *
      interpolate(ms, [T.pressUp, T.fingerOut], [1, 0], 'clamp');

    return {
      opacity,
      transform: [
        { translateX: x - FINGER / 2 },
        { translateY: y - FINGER / 2 },
        { scale: 1 - 0.2 * press },
      ],
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.finger, style]} />;
}

const styles = StyleSheet.create({
  stack: { gap: 14 },

  card: { padding: 18 },
  sentence: { fontSize: 17, lineHeight: 27 },
  /** 담은 표현의 밑줄(`sentence-detail`의 marked와 같다) */
  marked: {
    color: color.primary,
    textDecorationLine: 'underline',
    textDecorationColor: color.primaryLine,
  },
  /** 번역 속 담은 표현 — 영어 쪽과 같은 색·밑줄 */
  markedKo: {
    color: color.primary,
    textDecorationLine: 'underline',
    textDecorationColor: color.primaryLine,
  },

  meaning: { padding: 16, gap: 10 },
  reveal: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: color.fill.default,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  revealLabel: {
    ...type.label2,
    fontWeight: '600',
    color: color.text.secondary,
  },
  body: { gap: 10 },
  meaningText: { ...type.body2, lineHeight: 23, color: color.text.body },
  term: { ...type.label1, color: color.text.secondary },
  termQuote: { fontSize: 15, color: color.text.primary },

  finger: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: FINGER,
    height: FINGER,
    borderRadius: FINGER / 2,
    backgroundColor: ink(0.22),
    borderWidth: 2,
    borderColor: color.surface.base,
  },
});
