import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, type } from '@/shared/config';
import { AppText, CountBadge, Quote, Tap } from '@/shared/ui';
import type { ItemSummary } from '../api/item.api';

/**
 * 한 책 안에서 쓰는 카드 — 표현과 뜻, 그리고 몇 번 만났는지.
 *
 * 책등 색도 책 이름도 넣지 않는다. 이미 그 책 화면 안이라 출처가 자명하고,
 * 자명한 걸 한 번 더 말하면 정작 읽어야 할 표현이 묻힌다.
 * (여러 책을 건너다니는 서랍에서는 반대다 — `item-row.tsx`)
 *
 * 만난 횟수는 남긴다. 출처와 달리 이건 이 화면에서 알 수 없는 사실이고,
 * 두 번 만났다는 것 자체가 이 앱이 하려는 말이기 때문이다.
 */
export function ItemCard({
  item,
  onPress,
  style,
}: {
  item: ItemSummary;
  onPress?: () => void;
  /** 폭을 바꿀 때 — 격자에서는 칸을 채운다 */
  style?: StyleProp<ViewStyle>;
}) {
  const met = item.met;

  return (
    <Tap
      style={[styles.card, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.term}, ${item.meaning}${met > 1 ? `, ${met}번 만남` : ''}`}
    >
      <View style={styles.head}>
        <Quote numberOfLines={2} style={styles.term}>
          {item.term}
        </Quote>
        {met > 1 ? <CountBadge label={`${met}번 만남`} /> : null}
      </View>
      <View style={styles.rule} />
      {/* 한 줄에서 자른다. 훑어보는 목록이라 뜻은 실마리면 충분하고,
          전체는 항목 상세에서 본다. */}
      <AppText numberOfLines={1} ellipsizeMode="tail" style={styles.meaning}>
        {item.meaning}
      </AppText>
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: {
    /** 표현과 배지가 한 줄에 서려면 176으로는 좁다 */
    width: 208,
    padding: 14,
    borderRadius: 16,
    backgroundColor: color.surface.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  term: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    color: color.text.primary,
  },
  /** 책의 영어와 앱의 한국어 사이를 가르는 선 하나 */
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.default,
  },
  meaning: { ...type.label2, color: color.text.secondary },
});
