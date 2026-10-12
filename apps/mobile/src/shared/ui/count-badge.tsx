import { StyleSheet, View } from 'react-native';

import { color, type } from '@/shared/config';
import { AppText } from './text';

/**
 * "2번 만남" — 이 배지가 붙은 표현만이 북모리가 못 하는 일이다(재회).
 * 그래서 포인트 색이고, 그래서 한 번만 만난 표현에는 아예 붙지 않는다.
 * 문장 화면의 담은 표현 줄이 쓴다.
 */
export function CountBadge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <AppText style={styles.label}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: color.primaryTint,
  },
  label: { ...type.caption2, fontWeight: '700', color: color.primary },
});
