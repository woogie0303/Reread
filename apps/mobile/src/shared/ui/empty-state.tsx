import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { color, type } from '@/shared/config';
import { AppText } from './text';
import { Mark, type MarkName } from './marks';

/**
 * 데이터가 없는 자리. 글만 있으면 화면이 덜 만들어진 것처럼 보인다 —
 * 캐릭터를 먼저 두고, 그 아래에 짧게만 적는다.
 *
 * 무엇을 하면 채워지는지 말했으면, 그 일을 바로 할 수 있는 버튼(`action`)을 함께 둔다.
 * "찍어서 담아보세요"라고만 적어 두면 독자는 찍는 버튼을 다른 화면에서 찾아야 한다.
 */
export function EmptyState({
  mark,
  title,
  body,
  compact,
  action,
}: {
  mark: MarkName;
  title: string;
  body?: string;
  /** 빈자리를 채우는 일을 바로 하는 버튼 */
  action?: ReactNode;
  /** 화면 전체가 아니라 한 구획 안에 놓일 때 — 위아래 여백을 줄인다 */
  compact?: boolean;
}) {
  return (
    <View style={[styles.wrap, compact ? styles.compact : null]}>
      <Mark name={mark} size={compact ? 84 : 112} />
      <AppText style={styles.title}>{title}</AppText>
      {body ? <AppText style={styles.body}>{body}</AppText> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  compact: { paddingVertical: 20 },
  action: { marginTop: 8, alignSelf: 'stretch' },
  title: {
    ...type.label1,
    fontWeight: '600',
    color: color.text.secondary,
    textAlign: 'center',
  },
  body: {
    ...type.caption1,
    lineHeight: 18,
    color: color.text.secondary,
    textAlign: 'center',
  },
});
