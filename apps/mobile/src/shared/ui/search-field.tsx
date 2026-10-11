import type { ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { color, type } from '@/shared/config';
import { Icon } from './icon';

/**
 * 검색창 하나. 책 검색과 서랍 검색이 같은 상자를 쓴다.
 *
 * 한동안은 화면마다 따로 그려서 높이(46·40)·아이콘(17·18)·간격(10·8)이 제각각이었고,
 * 둘 다 글자가 상자 가운데보다 아래로 처져 있었다. iOS의 한 줄 `TextInput`은
 * `lineHeight`를 받으면 글자를 줄 상자의 아래쪽에 붙인다 — 타입 램프(`type.*`)를 통째로
 * 펼쳐 넣은 것이 원인이었다. 그래서 여기서는 크기·굵기만 가져오고 줄 높이는 주지 않는다.
 *
 * 높이 44는 엄지로 누르는 자리의 최소값이다.
 */
export function SearchField({
  trailing,
  style,
  ...input
}: Omit<TextInputProps, 'style'> & {
  /** 오른쪽 끝 — 찾는 중 스피너 같은 것 */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Icon name="search" size={18} color={color.text.assistive} />
      <TextInput
        placeholderTextColor={color.text.assistive}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        {...input}
        style={styles.input}
      />
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: color.surface.alt,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingVertical: 0,
    fontSize: type.body2.fontSize,
    fontWeight: '500',
    letterSpacing: type.body2.letterSpacing,
    color: color.text.primary,
  },
});
