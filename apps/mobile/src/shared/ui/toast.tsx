import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, gutter, type } from '../config';
import { AppText } from './text';

type Toast = { id: number; message: string };

/**
 * 알림을 보여줄 자리들. 맨 위 레이아웃의 `ToastHost`가 기본이지만, 네이티브 모달(`presentation:
 * 'modal'`)은 그 위에 따로 서서 맨 위의 알림을 가린다 — 모달 안의 화면도 제 `ToastHost`를 세운다.
 * 자리가 여럿이어도 가려진 쪽은 보이지 않을 뿐이라 같은 알림을 모두 받아 그린다.
 */
const listeners = new Set<(toast: Toast) => void>();
let seq = 0;

/** 이 말을 잠깐 띄운다. 화면을 나가도 사라지지 않아서, 뒤로 가며 한 일을 알릴 수 있다. */
export function showToast(message: string) {
  seq += 1;
  const toast = { id: seq, message };
  /** 화면을 못 보는 사람에게도 같은 말을 읽어준다 — 자리가 여럿이어도 한 번만 */
  AccessibilityInfo.announceForAccessibility(message);
  listeners.forEach((listener) => listener(toast));
}

/** 화면 아래에 잠깐 떴다 사라지는 한 줄. 네비게이션 위에 한 번, 모달 안에서는 모달마다 한 번. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { bottom: insets.bottom + 88 }]}
    >
      <Animated.View
        key={toast.id}
        entering={reduce ? undefined : FadeInDown.duration(180)}
        exiting={reduce ? undefined : FadeOutDown.duration(160)}
        style={styles.pill}
      >
        <AppText style={styles.text}>{toast.message}</AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** 탭 바 위에 뜬다 — 뒤로 가서 목록이 보일 때 가리지 않게 */
  wrap: {
    position: 'absolute',
    left: gutter,
    right: gutter,
    alignItems: 'center',
  },
  pill: {
    maxWidth: '100%',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: color.surface.ink,
  },
  text: { ...type.label2, fontWeight: '600', color: color.text.onInk },
});
