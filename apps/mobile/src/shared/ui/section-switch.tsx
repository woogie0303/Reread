import { StyleSheet, View } from 'react-native';

import { color, type } from '../config';
import { AppText } from './text';
import { Icon, type FilledIconName } from './icon';
import { Tap } from './pressable-row';

export type SectionOption<T extends string> = {
  value: T;
  icon: FilledIconName;
  title: string;
};

/**
 * 지금 보고 있는 갈래의 이름이 제목 자리에 그대로 서고, 갈아타는 버튼들은
 * 줄 끝으로 물러난다. 라벨을 모두 펴 놓으면 제목이 사라지고 컨트롤만 남는데,
 * 먼저 읽혀야 하는 건 지금 무엇을 보고 있는가다. 아이콘은 그 다음 — 옮겨 탈 수
 * 있다는 사실만 알리면 된다.
 *
 * 책 화면과 서랍이 같이 쓴다. 한동안 서랍만 글자 칩 셋을 펴 두었는데, 칩 이름이
 * 길어서 줄을 넘겼고 같은 일을 하는 두 화면이 다르게 생겨 있었다.
 *
 * 가운데 선은 장식이 아니라 제목과 버튼을 같은 줄에 묶어두는 자리다.
 */
export function SectionSwitch<T extends string>({
  options,
  value,
  onChange,
  count,
}: {
  options: SectionOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** 지금 갈래에 담긴 수 — 0이면 적지 않는다 */
  count?: number;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <View style={styles.row}>
      <AppText style={styles.title}>{current.title}</AppText>
      {count ? <AppText style={styles.aside}>{count}개</AppText> : null}

      <View style={styles.rule} />

      <View style={styles.switch}>
        {options.map((option) => {
          const on = option.value === value;
          return (
            <Tap
              key={option.value}
              style={[styles.button, on ? styles.buttonOn : null]}
              hitSlop={4}
              onPress={() => onChange(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={option.title}
            >
              <Icon
                name={option.icon}
                size={18}
                color={on ? color.text.primary : color.text.assistive}
              />
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    ...type.body2,
    fontWeight: '700',
    color: color.text.primary,
    letterSpacing: -0.15,
  },
  aside: { ...type.caption1, color: color.text.meta },
  /** 제목과 버튼 사이를 잇는 선 — 남는 폭을 전부 가져간다 */
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.default,
  },
  switch: { flexDirection: 'row', gap: 4 },
  /** 36에 hitSlop 4를 더해 엄지가 닿는 44가 된다 — 30이던 때는 옆 버튼을 자주 눌렀다 */
  button: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOn: { backgroundColor: color.fill.default },
});
