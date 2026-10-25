import { StyleSheet, View } from 'react-native';

import { color, type } from '@/shared/config';
import { ActionButton } from './button';
import { AltPanel } from './card';
import { Icon } from './icon';
import { AppText } from './text';

/**
 * 화면 위쪽에 서는 안내 패널 — 반짝이 아이콘과 제목, 본문, 그리고 있으면 버튼 하나.
 * 기다리는 문장 화면의 세 상태(광고·로그인 권유·'눌러서 물어보세요')가 이 한 양식을 쓴다.
 * 한동안 마지막 하나만 가운데 정렬의 큰 글씨여서, 같은 자리에서 서로 다른 화면처럼 보였다.
 */
export function NoticePanel({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: {
    label: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
  };
}) {
  return (
    <AltPanel style={styles.panel}>
      <View style={styles.head}>
        <Icon name="sparkle" size={15} color={color.primary} />
        <AppText style={styles.title}>{title}</AppText>
      </View>
      <AppText style={styles.body}>{body}</AppText>
      {action ? (
        <ActionButton
          label={action.label}
          variant="subtle"
          loading={action.loading}
          disabled={action.disabled}
          onPress={action.onPress}
        />
      ) : null}
    </AltPanel>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: {
    flex: 1,
    ...type.label2,
    fontWeight: '700',
    color: color.text.primary,
  },
  body: { ...type.label2, lineHeight: 21, color: color.text.secondary },
});
