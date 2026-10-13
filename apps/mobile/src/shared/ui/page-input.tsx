import {
  StyleSheet,
  TextInput,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { color, type } from '../config';

const PREFIX = 'p.';

/**
 * 쪽수 칸 — 'p.12'를 **한 칸 안의 한 줄 글**로 적는다.
 *
 * 한동안 'p.'는 글자(`Text`)로, 숫자는 그 옆 입력칸(`TextInput`)으로 따로 세웠다.
 * 둘은 글자를 그리는 상자가 달라서(글자는 줄 높이 안에, 입력칸은 제 높이 가운데)
 * 가운데 맞춤으로 나란히 놓으면 밑줄(베이스라인)이 어긋나고, 사이의 간격과 입력칸
 * 안쪽 여백 때문에 'p. 12'처럼 벌어졌다. 한 입력칸이 'p.'까지 함께 들고 있으면
 * 같은 줄 위에 붙어 선다. 부르는 쪽은 숫자만 주고받는다.
 *
 * 비어 있어도 'p.'는 늘 적어 둔다. 예전엔 비었을 때 'p. 쪽' 자리표시자를 깔았는데,
 * 커서가 그 글자 앞에 서서 'p'를 가리고 숫자를 치는 순간 글자가 바뀌며 흔들렸다.
 */
export function PageInput({
  value,
  onChangeValue,
  warn,
  onFocus,
  style,
}: {
  /** 숫자만 */
  value: string;
  onChangeValue: (digits: string) => void;
  /** 책에 없는 쪽이면 주의 색으로 */
  warn?: boolean;
  onFocus?: () => void;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <TextInput
      value={`${PREFIX}${value}`}
      onChangeText={(next) => onChangeValue(next.replace(/[^0-9]/g, ''))}
      onFocus={onFocus}
      keyboardType="number-pad"
      maxLength={PREFIX.length + 5}
      selectTextOnFocus={Boolean(value)}
      accessibilityLabel="몇 쪽인지"
      style={[styles.input, warn ? styles.warn : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: type.label2.fontSize,
    fontWeight: '700',
    color: color.primary,
    minWidth: 52,
    padding: 0,
  },
  warn: { color: color.status.cautionary },
});
